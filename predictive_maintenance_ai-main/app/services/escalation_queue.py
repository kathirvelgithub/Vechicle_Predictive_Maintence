import asyncio
import time
import traceback
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

from app.services.live_stream import stream_manager

try:
    from app.agents.master import master_agent
except ImportError:
    master_agent = None


@dataclass
class EscalationJob:
    vehicle_id: str
    telematics: Dict[str, Any]
    anomaly_level: str
    reasons: List[str]


class EscalationQueue:
    def __init__(self, cooldown_seconds: int = 60) -> None:
        self._queue: "asyncio.Queue[Optional[EscalationJob]]" = asyncio.Queue()
        self._workers: List[asyncio.Task] = []
        self._cooldown_seconds = cooldown_seconds
        self._last_enqueued: Dict[str, float] = {}
        self._pending_vehicles: Set[str] = set()
        self._lock = asyncio.Lock()

    async def start(self, worker_count: int = 1) -> None:
        if self._workers:
            return
        for index in range(worker_count):
            task = asyncio.create_task(self._worker_loop(index), name=f"escalation-worker-{index}")
            self._workers.append(task)

    async def stop(self) -> None:
        if not self._workers:
            return

        for _ in self._workers:
            await self._queue.put(None)

        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()

        async with self._lock:
            self._pending_vehicles.clear()

    async def enqueue(
        self,
        vehicle_id: str,
        telematics: Dict[str, Any],
        anomaly_level: str,
        reasons: List[str],
    ) -> bool:
        if anomaly_level not in {"HIGH", "CRITICAL"}:
            return False

        now = time.time()

        async with self._lock:
            previous = self._last_enqueued.get(vehicle_id, 0.0)
            if now - previous < self._cooldown_seconds:
                return False
            if vehicle_id in self._pending_vehicles:
                return False

            self._last_enqueued[vehicle_id] = now
            self._pending_vehicles.add(vehicle_id)

        await self._queue.put(
            EscalationJob(
                vehicle_id=vehicle_id,
                telematics=dict(telematics),
                anomaly_level=anomaly_level,
                reasons=list(reasons),
            )
        )
        return True

    async def stats(self) -> Dict[str, int]:
        async with self._lock:
            pending_count = len(self._pending_vehicles)
        return {
            "queue_depth": self._queue.qsize(),
            "pending_vehicles": pending_count,
            "workers": len(self._workers),
        }

    async def _worker_loop(self, worker_index: int) -> None:
        while True:
            job = await self._queue.get()
            if job is None:
                self._queue.task_done()
                break

            try:
                await self._process_job(job, worker_index)
            except Exception as exc:
                print(f"[EscalationWorker:{worker_index}] Failed to process {job.vehicle_id}: {exc}")
                traceback.print_exc()
            finally:
                async with self._lock:
                    self._pending_vehicles.discard(job.vehicle_id)
                self._queue.task_done()

    async def _process_job(self, job: EscalationJob, worker_index: int) -> None:
        if not master_agent:
            print(f"[EscalationWorker:{worker_index}] master_agent unavailable, skipping {job.vehicle_id}")
            return

        initial_state = {
            "run_id": "",
            "trigger_source": "queue_auto_escalation",
            "orchestration_route": "",
            "route_reason": "",
            "execution_started_at": None,
            "execution_finished_at": None,
            "node_statuses": {},
            "node_latency_ms": {},
            "model_used_by_node": {},
            "vehicle_id": job.vehicle_id,
            "vin": None,
            "vehicle_metadata": None,
            "telematics_data": job.telematics,
            "detected_issues": [],
            "risk_score": 0,
            "risk_level": "LOW",
            "diagnosis_report": "",
            "recommended_action": "Wait",
            "priority_level": "Low",
            "voice_transcript": [],
            "manufacturing_recommendations": "",
            "ueba_alert_triggered": False,
            "customer_script": "",
            "customer_decision": "PENDING",
            "selected_slot": None,
            "booking_id": None,
            "scheduled_date": None,
            "audio_url": None,
            "audio_available": False,
            "error_message": None,
            "feedback_request": None,
        }

        result = await asyncio.to_thread(master_agent.invoke, initial_state)

        from app.api.routes_predictive import PredictiveRequest, persist_analysis_outputs

        req = PredictiveRequest(
            vehicle_id=job.vehicle_id,
            engine_temp_c=int(job.telematics.get("engine_temp_c") or 90),
            oil_pressure_psi=float(job.telematics.get("oil_pressure_psi") or 40),
            rpm=int(job.telematics.get("rpm") or 1500),
            battery_voltage=float(job.telematics.get("battery_voltage") or 24),
            metadata={"source": "queue-auto-escalation", "skip_telematics_persist": True},
        )

        await asyncio.to_thread(persist_analysis_outputs, req, result)

        await stream_manager.broadcast(
            "analysis.completed",
            {
                "vehicle_id": job.vehicle_id,
                "risk_score": result.get("risk_score", 0),
                "risk_level": str(result.get("risk_level", "LOW")).upper(),
                "booking_id": result.get("booking_id"),
                "source": "queue-auto-escalation",
            },
        )


escalation_queue = EscalationQueue()
