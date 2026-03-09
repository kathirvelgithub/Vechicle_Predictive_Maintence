'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import {
  VehicleSimulator,
  TelemetrySnapshot,
} from '@/lib/vehicle-simulator';

const MAX_HISTORY = 60;
const ANALYSIS_INTERVAL = 15; // trigger AI every ~30s

// Fleet vehicles matching the database seed
const FLEET_VEHICLES = [
  { id: 'V-301', model: 'Mahindra Blazo X 35' },
  { id: 'V-302', model: 'Mahindra Furio 7' },
  { id: 'V-303', model: 'Mahindra XUV700' },
  { id: 'V-304', model: 'Mahindra Bolero' },
  { id: 'V-401', model: 'Honda City' },
  { id: 'V-402', model: 'Honda Civic' },
  { id: 'V-403', model: 'Honda Amaze' },
];

export interface AIPrediction {
  vehicle_id: string;
  risk_score: number;
  risk_level: string;
  diagnosis: string;
  customer_script?: string;
  booking_id?: string;
  manufacturing_insights?: string;
  ueba_alerts?: { message: string }[];
  timestamp: string;
}

export interface FleetVehicleState {
  vehicleId: string;
  model: string;
  current: TelemetrySnapshot | null;
  history: TelemetrySnapshot[];
  prediction: AIPrediction | null;
  predictionLoading: boolean;
}

export function useSimulation() {
  const simulatorsRef = useRef<Map<string, VehicleSimulator>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickCountRef = useRef(0);
  const analysisInFlightRef = useRef<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(FLEET_VEHICLES[0].id);
  const [fleet, setFleet] = useState<Map<string, FleetVehicleState>>(() => {
    const m = new Map<string, FleetVehicleState>();
    for (const v of FLEET_VEHICLES) {
      m.set(v.id, {
        vehicleId: v.id,
        model: v.model,
        current: null,
        history: [],
        prediction: null,
        predictionLoading: false,
      });
    }
    return m;
  });
  const [alertLog, setAlertLog] = useState<TelemetrySnapshot['alerts']>([]);

  // Initialize simulators for each vehicle
  if (simulatorsRef.current.size === 0) {
    for (const v of FLEET_VEHICLES) {
      simulatorsRef.current.set(v.id, new VehicleSimulator(v.id));
    }
  }

  // ── Send telemetry batch to backend ───────────────────────────
  const sendTelemetry = useCallback((snapshots: TelemetrySnapshot[]) => {
    fetch('/api/telematics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshots),
    }).catch(() => {});
  }, []);

  // ── Trigger AI analysis for a specific vehicle ────────────────
  const triggerAnalysis = useCallback(async (snap: TelemetrySnapshot) => {
    const vid = snap.vehicleId;
    if (analysisInFlightRef.current.has(vid)) return;
    analysisInFlightRef.current.add(vid);

    setFleet(prev => {
      const next = new Map(prev);
      const vs = next.get(vid);
      if (vs) next.set(vid, { ...vs, predictionLoading: true });
      return next;
    });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snap),
      });
      if (res.ok) {
        const data: AIPrediction = await res.json();
        data.timestamp = new Date().toISOString();
        setFleet(prev => {
          const next = new Map(prev);
          const vs = next.get(vid);
          if (vs) next.set(vid, { ...vs, prediction: data, predictionLoading: false });
          return next;
        });
      }
    } catch {
      /* AI backend offline — skip */
    } finally {
      analysisInFlightRef.current.delete(vid);
      setFleet(prev => {
        const next = new Map(prev);
        const vs = next.get(vid);
        if (vs) next.set(vid, { ...vs, predictionLoading: false });
        return next;
      });
    }
  }, []);

  // ── Tick all vehicles ─────────────────────────────────────────
  const tick = useCallback(() => {
    const batchSnapshots: TelemetrySnapshot[] = [];

    setFleet(prev => {
      const next = new Map(prev);
      for (const [vid, sim] of simulatorsRef.current) {
        const snap = sim.tick();
        batchSnapshots.push(snap);
        const vs = next.get(vid);
        if (vs) {
          const newHistory = [...vs.history.slice(-(MAX_HISTORY - 1)), snap];
          next.set(vid, { ...vs, current: snap, history: newHistory });
        }
      }
      return next;
    });

    // Collect alerts from all vehicles
    const newAlerts = batchSnapshots.flatMap(s => s.alerts);
    if (newAlerts.length > 0) {
      setAlertLog(prev => [...newAlerts, ...prev].slice(0, 100));
    }

    // Send all telemetry in one batch
    sendTelemetry(batchSnapshots);

    // Trigger AI analysis periodically or for critical vehicles
    tickCountRef.current += 1;
    const isAnalysisTick = tickCountRef.current % ANALYSIS_INTERVAL === 0;

    for (const snap of batchSnapshots) {
      const shouldAnalyze = isAnalysisTick || snap.status === 'critical';
      if (shouldAnalyze) {
        triggerAnalysis(snap);
      }
    }
  }, [sendTelemetry, triggerAnalysis]);

  const start = useCallback(() => {
    if (timerRef.current) return;
    tick();
    timerRef.current = setInterval(tick, 2000);
    setRunning(true);
  }, [tick]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    for (const sim of simulatorsRef.current.values()) {
      sim.reset();
    }
    tickCountRef.current = 0;
    setFleet(prev => {
      const next = new Map(prev);
      for (const [vid, vs] of next) {
        next.set(vid, { ...vs, current: null, history: [], prediction: null, predictionLoading: false });
      }
      return next;
    });
    setAlertLog([]);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Derive the currently selected vehicle's data
  const selected = fleet.get(selectedVehicle);
  const current = selected?.current ?? null;
  const history = selected?.history ?? [];
  const prediction = selected?.prediction ?? null;
  const predictionLoading = selected?.predictionLoading ?? false;

  return {
    running,
    current,
    history,
    alertLog,
    prediction,
    predictionLoading,
    start,
    stop,
    reset,
    // Fleet-specific exports
    fleet: Array.from(fleet.values()),
    fleetVehicles: FLEET_VEHICLES,
    selectedVehicle,
    setSelectedVehicle,
  };
}
