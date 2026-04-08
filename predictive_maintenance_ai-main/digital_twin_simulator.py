import argparse
import json
import math
import random
import socket
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import pandas as pd
import requests

API_URL = "http://localhost:8000/api/predictive/run"
CSV_FILE = "engine_data.csv"

VIRTUAL_FLEET = [
    {"vehicle_id": "V-301", "model": "Mahindra XUV 3XO"},
    {"vehicle_id": "V-302", "model": "Mahindra Thar"},
    {"vehicle_id": "V-303", "model": "Mahindra Scorpio N"},
    {"vehicle_id": "V-304", "model": "Mahindra XUV700"},
    {"vehicle_id": "V-401", "model": "Honda City"},
    {"vehicle_id": "V-402", "model": "Honda Elevate"},
    {"vehicle_id": "V-403", "model": "Honda City Hybrid eHEV"},
]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _safe_fault_code(risk_band: str) -> str:
    if risk_band == "critical":
        return random.choice(["P0217", "P0524", "P0562"])
    if risk_band == "watch":
        return random.choice(["P0128", "P0171", "P0300", "None"])
    return "None"


def _risk_band_rank(band: str) -> int:
    return {"normal": 0, "watch": 1, "critical": 2}.get((band or "normal").lower(), 0)


def _highest_risk_band(bands: List[str]) -> str:
    if not bands:
        return "normal"
    return max((str(b).lower() for b in bands), key=_risk_band_rank)


def _risk_band_from_metrics(engine_temp_c: float, oil_pressure_psi: float, speed_kmh: float) -> str:
    if engine_temp_c >= 114 or oil_pressure_psi <= 16:
        return "critical"
    if engine_temp_c >= 102 or oil_pressure_psi <= 24 or speed_kmh >= 95:
        return "watch"
    return "normal"


@dataclass
class TelemetryEvent:
    vehicle_id: str
    model: str
    engine_temp_c: float
    oil_pressure_psi: float
    rpm: int
    battery_voltage: float
    dtc_readable: str
    source: str
    risk_band: str
    speed_kmh: Optional[float] = None
    traffic_density: Optional[float] = None
    actor_id: Optional[str] = None

    def to_api_payload(self) -> Dict[str, object]:
        return {
            "vehicle_id": self.vehicle_id,
            "engine_temp_c": int(round(self.engine_temp_c)),
            "oil_pressure_psi": round(self.oil_pressure_psi, 1),
            "rpm": int(self.rpm),
            "battery_voltage": round(self.battery_voltage, 1),
            "dtc_readable": self.dtc_readable,
            "metadata": {
                "model": self.model,
                "sim_source": self.source,
                "sim_risk_band": self.risk_band,
                "speed_kmh": round(float(self.speed_kmh), 2) if self.speed_kmh is not None else None,
                "traffic_density": round(float(self.traffic_density), 3) if self.traffic_density is not None else None,
                "carla_actor_id": self.actor_id,
            },
        }


class BaseSource:
    name = "base"

    def is_available(self) -> bool:
        return True

    def connect(self) -> None:
        return None

    def step(self) -> None:
        return None

    def close(self) -> None:
        return None

    def next_event(self, vehicle: Dict[str, str]) -> TelemetryEvent:
        raise NotImplementedError


class FallbackSource(BaseSource):
    name = "fallback"

    def __init__(self, csv_file: str, critical_bias: float = 0.12) -> None:
        self.df = pd.read_csv(csv_file)
        self.critical_bias = _clamp(critical_bias, 0.0, 0.9)
        self.vehicle_state = {
            vehicle["vehicle_id"]: {
                "engine_temp_c": random.uniform(86, 92),
                "oil_pressure_psi": random.uniform(34, 43),
                "battery_voltage": random.uniform(12.4, 12.9),
            }
            for vehicle in VIRTUAL_FLEET
        }

    def _pick_band(self) -> str:
        threshold = random.random()
        watch_bias = 0.25
        normal_bias = 1.0 - self.critical_bias - watch_bias
        if normal_bias < 0.1:
            normal_bias = 0.1
            watch_bias = 0.9 - self.critical_bias

        if threshold < normal_bias:
            return "normal"
        if threshold < normal_bias + watch_bias:
            return "watch"
        return "critical"

    def next_event(self, vehicle: Dict[str, str]) -> TelemetryEvent:
        row = self.df.sample(n=1).iloc[0]
        band = self._pick_band()

        state = self.vehicle_state[vehicle["vehicle_id"]]
        temp = state["engine_temp_c"]
        oil = state["oil_pressure_psi"]
        batt = state["battery_voltage"]

        if band == "normal":
            temp += random.uniform(-1.2, 1.5)
            oil += random.uniform(-1.2, 1.3)
            batt += random.uniform(-0.03, 0.03)
        elif band == "watch":
            temp += random.uniform(1.0, 3.5)
            oil += random.uniform(-2.6, -0.8)
            batt += random.uniform(-0.15, 0.0)
        else:
            temp += random.uniform(2.8, 6.0)
            oil += random.uniform(-4.2, -2.0)
            batt += random.uniform(-0.25, -0.05)

        temp = _clamp(temp, 78.0, 126.0)
        oil = _clamp(oil, 5.0, 48.0)
        batt = _clamp(batt, 11.1, 13.1)

        state["engine_temp_c"] = temp
        state["oil_pressure_psi"] = oil
        state["battery_voltage"] = batt

        return TelemetryEvent(
            vehicle_id=vehicle["vehicle_id"],
            model=vehicle["model"],
            engine_temp_c=temp,
            oil_pressure_psi=oil,
            rpm=int(row["Engine rpm"]),
            battery_voltage=batt,
            dtc_readable=_safe_fault_code(band),
            source=self.name,
            risk_band=band,
            speed_kmh=_clamp((int(row["Engine rpm"]) - 700) / 38 + random.uniform(-3, 4), 0, 140),
            traffic_density=_clamp(0.25 + random.uniform(-0.1, 0.2), 0.05, 0.9),
        )


class SumoSource(BaseSource):
    name = "sumo"

    def __init__(self, fallback: FallbackSource, traci_port: int = 8813) -> None:
        self.fallback = fallback
        self.traci_port = traci_port
        self._traci = None
        self._density = 0.0
        self._mapped_ids: Dict[str, str] = {}
        self._known_vehicle_ids: List[str] = []

    def is_available(self) -> bool:
        try:
            import traci  # type: ignore
            self._traci = traci
            return True
        except Exception:
            return False

    def connect(self) -> None:
        if self._traci is None:
            return
        # Connection may fail when SUMO is not running; fallback remains available.
        self._traci.init(self.traci_port)
        self._refresh_vehicle_mapping()

    def step(self) -> None:
        if self._traci is None:
            return
        try:
            self._traci.simulationStep()
        except Exception:
            return
        self._refresh_vehicle_mapping()

    def _refresh_vehicle_mapping(self) -> None:
        if self._traci is None:
            return
        try:
            ids = list(self._traci.vehicle.getIDList())
        except Exception:
            ids = []

        self._known_vehicle_ids = ids
        self._density = _clamp(len(ids) / 30.0, 0.0, 1.0)

        remaining = [vehicle_id for vehicle_id in ids]
        mapped: Dict[str, str] = {}
        for vehicle in VIRTUAL_FLEET:
            fleet_id = vehicle["vehicle_id"]
            if fleet_id in ids:
                mapped[fleet_id] = fleet_id
                if fleet_id in remaining:
                    remaining.remove(fleet_id)

        for vehicle in VIRTUAL_FLEET:
            fleet_id = vehicle["vehicle_id"]
            if fleet_id in mapped:
                continue
            if fleet_id in self._mapped_ids and self._mapped_ids[fleet_id] in remaining:
                mapped[fleet_id] = self._mapped_ids[fleet_id]
                remaining.remove(self._mapped_ids[fleet_id])
                continue
            if remaining:
                mapped[fleet_id] = remaining.pop(0)

        self._mapped_ids = mapped

    def close(self) -> None:
        if self._traci is None:
            return
        try:
            self._traci.close()
        except Exception:
            pass

    def next_event(self, vehicle: Dict[str, str]) -> TelemetryEvent:
        if self._traci is None:
            return self.fallback.next_event(vehicle)

        base_event = self.fallback.next_event(vehicle)
        try:
            sumo_vehicle_id = self._mapped_ids.get(vehicle["vehicle_id"])
            if not sumo_vehicle_id:
                return base_event

            speed_ms = float(self._traci.vehicle.getSpeed(sumo_vehicle_id))
            speed_kmh = max(0.0, speed_ms * 3.6)
            rpm = int(_clamp(700 + speed_kmh * 45 + random.uniform(-90, 90), 700, 4500))
            engine_temp = _clamp(base_event.engine_temp_c + (self._density * 2.2) + (speed_kmh / 140.0), 78.0, 126.0)
            oil_pressure = _clamp(base_event.oil_pressure_psi - (self._density * 0.9), 5.0, 48.0)
            band = _highest_risk_band([
                base_event.risk_band,
                "watch" if speed_kmh > 85 or self._density > 0.7 else "normal",
                _risk_band_from_metrics(engine_temp, oil_pressure, speed_kmh),
            ])
            return TelemetryEvent(
                vehicle_id=base_event.vehicle_id,
                model=base_event.model,
                engine_temp_c=engine_temp,
                oil_pressure_psi=oil_pressure,
                rpm=rpm,
                battery_voltage=base_event.battery_voltage,
                dtc_readable=_safe_fault_code(band),
                source=self.name,
                risk_band=band,
                speed_kmh=speed_kmh,
                traffic_density=self._density,
            )
        except Exception:
            return base_event


class CarlaSource(BaseSource):
    name = "carla"

    def __init__(self, fallback: FallbackSource, host: str = "127.0.0.1", port: int = 2000) -> None:
        self.fallback = fallback
        self.host = host
        self.port = port
        self._carla = None
        self._client = None
        self._world = None
        self._actor_by_vehicle_id: Dict[str, object] = {}

    def is_available(self) -> bool:
        try:
            import carla  # type: ignore
            self._carla = carla
            return True
        except Exception:
            return False

    def connect(self) -> None:
        if self._carla is None:
            return
        self._client = self._carla.Client(self.host, self.port)
        self._client.set_timeout(1.0)
        self._world = self._client.get_world()
        self._refresh_actor_mapping()

    def step(self) -> None:
        if self._world is None:
            return
        try:
            self._world.get_snapshot()
            if random.random() < 0.2:
                self._refresh_actor_mapping()
        except Exception:
            return

    def _refresh_actor_mapping(self) -> None:
        if self._world is None:
            return

        try:
            actors = list(self._world.get_actors().filter("vehicle.*"))
        except Exception:
            actors = []

        mapped: Dict[str, object] = {}
        remaining = actors[:]
        for vehicle in VIRTUAL_FLEET:
            vehicle_id = vehicle["vehicle_id"]
            for actor in remaining:
                role_name = str(actor.attributes.get("role_name", ""))
                if vehicle_id == role_name or vehicle_id.lower() in role_name.lower():
                    mapped[vehicle_id] = actor
                    remaining.remove(actor)
                    break

        for vehicle in VIRTUAL_FLEET:
            vehicle_id = vehicle["vehicle_id"]
            if vehicle_id in mapped:
                continue
            previous_actor = self._actor_by_vehicle_id.get(vehicle_id)
            if previous_actor in remaining:
                mapped[vehicle_id] = previous_actor
                remaining.remove(previous_actor)
                continue
            if remaining:
                mapped[vehicle_id] = remaining.pop(0)

        self._actor_by_vehicle_id = mapped

    def next_event(self, vehicle: Dict[str, str]) -> TelemetryEvent:
        event = self.fallback.next_event(vehicle)
        if self._world is None:
            return event

        actor = self._actor_by_vehicle_id.get(vehicle["vehicle_id"])
        if actor is None:
            return event

        try:
            velocity = actor.get_velocity()
            acceleration = actor.get_acceleration()
            speed_kmh = max(0.0, math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2) * 3.6)
            accel_mag = max(0.0, math.sqrt(acceleration.x ** 2 + acceleration.y ** 2 + acceleration.z ** 2))
            engine_temp = _clamp(event.engine_temp_c + (speed_kmh / 55.0) + (accel_mag * 0.9), 78.0, 128.0)
            oil_pressure = _clamp(event.oil_pressure_psi - (accel_mag * 0.7) + random.uniform(-0.3, 0.3), 5.0, 48.0)
            rpm = int(_clamp(750 + speed_kmh * 42 + accel_mag * 140 + random.uniform(-80, 90), 700, 5000))
            battery = _clamp(event.battery_voltage - accel_mag * 0.01 + random.uniform(-0.02, 0.01), 11.1, 13.1)
            band = _highest_risk_band([
                event.risk_band,
                _risk_band_from_metrics(engine_temp, oil_pressure, speed_kmh),
            ])
        except Exception:
            return event

        return TelemetryEvent(
            vehicle_id=event.vehicle_id,
            model=event.model,
            engine_temp_c=engine_temp,
            oil_pressure_psi=oil_pressure,
            rpm=rpm,
            battery_voltage=battery,
            dtc_readable=_safe_fault_code(band),
            source=self.name,
            risk_band=band,
            speed_kmh=speed_kmh,
            actor_id=str(getattr(actor, "id", "")),
        )


class HybridSource(BaseSource):
    name = "hybrid"

    def __init__(self, fallback: FallbackSource, carla_source: CarlaSource, sumo_source: SumoSource) -> None:
        self.fallback = fallback
        self.carla_source = carla_source
        self.sumo_source = sumo_source
        self._active_sources: List[BaseSource] = []

    def is_available(self) -> bool:
        return True

    def connect(self) -> None:
        for source in (self.carla_source, self.sumo_source):
            if source.is_available():
                try:
                    source.connect()
                    self._active_sources.append(source)
                except Exception:
                    continue

    def step(self) -> None:
        for source in self._active_sources:
            try:
                source.step()
            except Exception:
                continue

    def close(self) -> None:
        for source in self._active_sources:
            source.close()

    def next_event(self, vehicle: Dict[str, str]) -> TelemetryEvent:
        fallback_event = self.fallback.next_event(vehicle)
        carla_event: Optional[TelemetryEvent] = None
        sumo_event: Optional[TelemetryEvent] = None

        for source in self._active_sources:
            try:
                if source.name == "carla":
                    carla_event = source.next_event(vehicle)
                elif source.name == "sumo":
                    sumo_event = source.next_event(vehicle)
            except Exception:
                continue

        merged = fallback_event
        source_parts = ["fallback"]

        if sumo_event is not None:
            merged = TelemetryEvent(
                vehicle_id=merged.vehicle_id,
                model=merged.model,
                engine_temp_c=merged.engine_temp_c,
                oil_pressure_psi=merged.oil_pressure_psi,
                rpm=sumo_event.rpm,
                battery_voltage=merged.battery_voltage,
                dtc_readable=merged.dtc_readable,
                source=merged.source,
                risk_band=_highest_risk_band([merged.risk_band, sumo_event.risk_band]),
                speed_kmh=sumo_event.speed_kmh,
                traffic_density=sumo_event.traffic_density,
                actor_id=merged.actor_id,
            )
            source_parts.append("sumo")

        if carla_event is not None:
            merged = TelemetryEvent(
                vehicle_id=merged.vehicle_id,
                model=merged.model,
                engine_temp_c=carla_event.engine_temp_c,
                oil_pressure_psi=carla_event.oil_pressure_psi,
                rpm=carla_event.rpm if carla_event.rpm else merged.rpm,
                battery_voltage=carla_event.battery_voltage,
                dtc_readable=carla_event.dtc_readable,
                source=merged.source,
                risk_band=_highest_risk_band([merged.risk_band, carla_event.risk_band]),
                speed_kmh=carla_event.speed_kmh if carla_event.speed_kmh is not None else merged.speed_kmh,
                traffic_density=merged.traffic_density,
                actor_id=carla_event.actor_id,
            )
            source_parts.append("carla")

        merged.source = f"hybrid({' + '.join(source_parts)})"
        return merged


def _source_from_name(name: str, fallback: FallbackSource, carla_host: str, carla_port: int, sumo_port: int) -> BaseSource:
    mode = (name or "fallback").strip().lower()
    if mode == "sumo":
        return SumoSource(fallback=fallback, traci_port=sumo_port)
    if mode == "carla":
        return CarlaSource(fallback=fallback, host=carla_host, port=carla_port)
    if mode == "hybrid":
        return HybridSource(
            fallback=fallback,
            carla_source=CarlaSource(fallback=fallback, host=carla_host, port=carla_port),
            sumo_source=SumoSource(fallback=fallback, traci_port=sumo_port),
        )
    return fallback


def _send_to_api(api_url: str, event: TelemetryEvent, timeout_sec: int = 20) -> None:
    payload = event.to_api_payload()
    response = requests.post(api_url, json=payload, timeout=timeout_sec)
    print(
        f"[{event.source}] {event.vehicle_id} ({event.risk_band.upper()}) -> {response.status_code} | "
        f"Temp={payload['engine_temp_c']}C Oil={payload['oil_pressure_psi']}psi Batt={payload['battery_voltage']}V"
    )


def _dry_run_print(event: TelemetryEvent) -> None:
    payload = event.to_api_payload()
    print(json.dumps(payload, ensure_ascii=True))


def _candidate_health_urls(api_url: str) -> List[str]:
    normalized = api_url.rstrip("/")
    base = normalized
    if "/api/" in normalized:
        base = normalized.split("/api/", 1)[0]

    candidates = [
        f"{base}/health",
        f"{base}/ready",
        f"{base}/",
    ]

    seen: Dict[str, bool] = {}
    ordered: List[str] = []
    for url in candidates:
        if url not in seen:
            seen[url] = True
            ordered.append(url)
    return ordered


def _tcp_port_open(host: str, port: int, timeout_sec: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_sec):
            return True
    except Exception:
        return False


def _source_requires_carla(source_name: str) -> bool:
    mode = (source_name or "fallback").lower()
    return mode in {"carla", "hybrid"}


def _source_requires_sumo(source_name: str) -> bool:
    mode = (source_name or "fallback").lower()
    return mode in {"sumo", "hybrid"}


def run_readiness_check(
    api_url: str,
    source_name: str,
    carla_host: str,
    carla_port: int,
    sumo_port: int,
    require_backend: bool = True,
) -> Dict[str, Dict[str, object]]:
    report: Dict[str, Dict[str, object]] = {
        "backend": {"ready": False, "detail": "not_checked"},
        "carla": {"ready": True, "detail": "not_required"},
        "sumo": {"ready": True, "detail": "not_required"},
    }

    backend_ready = False
    backend_detail = "unreachable"
    for url in _candidate_health_urls(api_url):
        try:
            response = requests.get(url, timeout=3)
            # Treat <500 as reachable to avoid requiring a specific health endpoint contract.
            if response.status_code < 500:
                backend_ready = True
                backend_detail = f"{url} -> {response.status_code}"
                break
        except Exception:
            continue
    report["backend"] = {
        "ready": backend_ready,
        "detail": backend_detail if require_backend else f"optional:{backend_detail}",
    }

    if _source_requires_carla(source_name):
        try:
            import carla  # type: ignore

            carla_module = True
            client = None
            world_ok = False
            if _tcp_port_open(carla_host, carla_port, timeout_sec=1.0):
                try:
                    client = carla.Client(carla_host, carla_port)
                    client.set_timeout(1.0)
                    client.get_world()
                    world_ok = True
                except Exception:
                    world_ok = False
            report["carla"] = {
                "ready": bool(carla_module and world_ok),
                "detail": (
                    f"module_ok, world_ok at {carla_host}:{carla_port}"
                    if world_ok
                    else f"module_ok, server_unreachable_or_world_failed at {carla_host}:{carla_port}"
                ),
            }
        except Exception:
            report["carla"] = {
                "ready": False,
                "detail": "carla_python_module_missing",
            }

    if _source_requires_sumo(source_name):
        try:
            import traci  # type: ignore  # noqa: F401

            port_open = _tcp_port_open("127.0.0.1", sumo_port, timeout_sec=1.0)
            report["sumo"] = {
                "ready": bool(port_open),
                "detail": (
                    f"traci_module_ok, traci_port_open at 127.0.0.1:{sumo_port}"
                    if port_open
                    else f"traci_module_ok, traci_port_closed at 127.0.0.1:{sumo_port}"
                ),
            }
        except Exception:
            report["sumo"] = {
                "ready": False,
                "detail": "traci_module_missing",
            }

    return report


def _print_readiness_report(report: Dict[str, Dict[str, object]], source_name: str) -> None:
    print(f"Readiness report for source='{source_name}':")
    for component in ("backend", "carla", "sumo"):
        entry = report.get(component, {})
        status = "READY" if bool(entry.get("ready")) else "NOT_READY"
        detail = str(entry.get("detail", ""))
        print(f"  - {component}: {status} ({detail})")


def _is_ready_for_source(report: Dict[str, Dict[str, object]], source_name: str, require_backend: bool = True) -> bool:
    if require_backend and not bool(report.get("backend", {}).get("ready")):
        return False
    if _source_requires_carla(source_name) and not bool(report.get("carla", {}).get("ready")):
        return False
    if _source_requires_sumo(source_name) and not bool(report.get("sumo", {}).get("ready")):
        return False
    return True


def _preflight_backend_health(api_url: str, timeout_sec: int) -> bool:
    for url in _candidate_health_urls(api_url):
        try:
            response = requests.get(url, timeout=max(2, min(timeout_sec, 8)))
            if response.status_code < 500:
                print(f"Backend preflight OK: {url} -> {response.status_code}")
                return True
        except Exception:
            continue

    print("Backend preflight failed. No healthy endpoint responded.")
    return False


def run_simulation(
    api_url: str,
    source_name: str,
    rounds: int,
    delay_sec: float,
    critical_bias: float,
    carla_host: str,
    carla_port: int,
    sumo_port: int,
    request_timeout_sec: int,
    dry_run: bool,
    skip_health_check: bool,
    max_consecutive_timeouts: int,
    strict_source_check: bool,
) -> None:
    fallback = FallbackSource(csv_file=CSV_FILE, critical_bias=critical_bias)
    source = _source_from_name(source_name, fallback, carla_host, carla_port, sumo_port)

    print(f"Loaded engine dataset with {len(fallback.df)} records")
    print(f"Simulation source mode: {source.name}")

    if source is not fallback and not source.is_available():
        print(f"Source '{source.name}' dependencies not available. Switching to fallback source.")
        source = fallback

    readiness = run_readiness_check(
        api_url=api_url,
        source_name=source.name,
        carla_host=carla_host,
        carla_port=carla_port,
        sumo_port=sumo_port,
        require_backend=(not dry_run),
    )
    _print_readiness_report(readiness, source.name)
    if strict_source_check and not _is_ready_for_source(readiness, source.name, require_backend=(not dry_run)):
        print("Strict source check failed. Fix readiness issues or disable --strict-source-check.")
        return

    try:
        source.connect()
    except Exception as exc:
        print(f"Source '{source.name}' connect failed: {exc}. Switching to fallback source.")
        source = fallback

    if not dry_run and not skip_health_check:
        if not _preflight_backend_health(api_url=api_url, timeout_sec=request_timeout_sec):
            print("Stopping simulation early. Use --skip-health-check to force run anyway.")
            return

    start = time.time()
    total_rounds = max(1, rounds)
    consecutive_timeouts = 0

    try:
        for round_number in range(1, total_rounds + 1):
            print(f"--- Round {round_number}/{total_rounds} ---")
            source.step()
            for vehicle in VIRTUAL_FLEET:
                try:
                    event = source.next_event(vehicle)
                    if dry_run:
                        _dry_run_print(event)
                    else:
                        _send_to_api(api_url=api_url, event=event, timeout_sec=request_timeout_sec)
                    consecutive_timeouts = 0
                except requests.exceptions.Timeout:
                    print(f"[{source.name}] {vehicle['vehicle_id']} timed out")
                    consecutive_timeouts += 1
                    if max_consecutive_timeouts > 0 and consecutive_timeouts >= max_consecutive_timeouts:
                        print(
                            "Stopping simulation due to repeated backend timeouts. "
                            f"consecutive_timeouts={consecutive_timeouts}"
                        )
                        return
                except Exception as exc:
                    print(f"[{source.name}] {vehicle['vehicle_id']} failed: {exc}")

            if round_number < total_rounds and delay_sec > 0:
                time.sleep(delay_sec)
    finally:
        source.close()

    print(f"Simulation completed in {time.time() - start:.2f}s")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Digital Twin simulation runner with CARLA and SUMO adapters")
    parser.add_argument("--api-url", type=str, default=API_URL)
    parser.add_argument("--source", type=str, choices=["fallback", "sumo", "carla", "hybrid"], default="fallback")
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--between-rounds-sec", type=float, default=2.0)
    parser.add_argument("--critical-bias", type=float, default=0.12)
    parser.add_argument("--request-timeout-sec", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true", help="Generate and print telemetry payloads without calling backend API.")
    parser.add_argument("--check-only", action="store_true", help="Run environment readiness checks and exit without simulation.")
    parser.add_argument("--skip-health-check", action="store_true", help="Skip backend preflight endpoint health check.")
    parser.add_argument(
        "--strict-source-check",
        action="store_true",
        help="Fail simulation if selected live source dependencies are not ready.",
    )
    parser.add_argument(
        "--max-consecutive-timeouts",
        type=int,
        default=4,
        help="Fail fast after this many consecutive request timeouts. Set 0 to disable.",
    )
    parser.add_argument("--carla-host", type=str, default="127.0.0.1")
    parser.add_argument("--carla-port", type=int, default=2000)
    parser.add_argument("--sumo-port", type=int, default=8813)
    return parser


if __name__ == "__main__":
    args = _parser().parse_args()

    if args.check_only:
        report = run_readiness_check(
            api_url=args.api_url,
            source_name=args.source,
            carla_host=args.carla_host,
            carla_port=args.carla_port,
            sumo_port=args.sumo_port,
            require_backend=(not args.dry_run),
        )
        _print_readiness_report(report, args.source)
        sys.exit(0 if _is_ready_for_source(report, args.source, require_backend=(not args.dry_run)) else 1)

    run_simulation(
        api_url=args.api_url,
        source_name=args.source,
        rounds=args.rounds,
        delay_sec=args.between_rounds_sec,
        critical_bias=args.critical_bias,
        carla_host=args.carla_host,
        carla_port=args.carla_port,
        sumo_port=args.sumo_port,
        request_timeout_sec=args.request_timeout_sec,
        dry_run=args.dry_run,
        skip_health_check=args.skip_health_check,
        max_consecutive_timeouts=args.max_consecutive_timeouts,
        strict_source_check=args.strict_source_check,
    )
