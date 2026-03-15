'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Square,
  RotateCcw,
  Car,
  Brain,
  Wrench,
  Loader2,
  Bell,
  Calendar,
  Activity,
  Truck,
} from 'lucide-react';

import { useSimulation } from '@/hooks/use-simulation';
import { TelemetryCard, PARAMS } from '@/components/telemetry-card';
import { TrendCharts } from '@/components/trend-charts';

// ── page ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const {
    running, current, history,
    prediction, predictionLoading,
    start, stop, reset,
    fleet, fleetVehicles, selectedVehicle, setSelectedVehicle,
    overrides, setOverride,
  } = useSimulation();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] relative overflow-x-hidden">
      {/* ── ambient glow ──────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-blue-600/[0.07] blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-purple-600/[0.06] blur-[120px]" />
        <div className="absolute -bottom-40 left-1/2 w-[500px] h-[500px] rounded-full bg-cyan-600/[0.05] blur-[120px]" />
      </div>

      {/* ── header ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[var(--background)]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[1440px] flex items-center justify-between px-6 py-4 lg:px-10">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4">
            <div className="relative flex items-center justify-center">
              <span className="absolute inset-0 rounded-xl bg-blue-500/20 blur-md" />
              <span className="relative grid place-items-center w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                <Truck className="w-6 h-6 text-white" />
              </span>
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight leading-none">Fleet Intelligence</h1>
              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Multi-Agent Predictive Maintenance</p>
            </div>
          </motion.div>

          {/* Vehicle selector */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="hidden md:flex items-center gap-4">
            <select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              className="bg-white/[0.06] border border-white/[0.1] rounded-xl px-4 py-2 text-sm font-bold text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              {fleetVehicles.map(v => (
                <option key={v.id} value={v.id} className="bg-zinc-900">{v.id} — {v.model}</option>
              ))}
            </select>

            <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
              {running ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-emerald-400">Live — {fleet.length} vehicles</span>
                </>
              ) : (
                <>
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                  <span>Idle</span>
                </>
              )}
            </span>


          </motion.div>

          {/* Controls */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="flex items-center gap-2">
            {!running ? (
              <button onClick={start} className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-lg shadow-emerald-600/20">
                <Play className="w-4 h-4" /> Start Fleet
              </button>
            ) : (
              <button onClick={stop} className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-lg shadow-red-600/20">
                <Square className="w-4 h-4" /> Stop
              </button>
            )}
            <button onClick={reset} className="flex items-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.06] px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-colors">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </motion.div>
        </div>
      </header>

      {/* ── main area ─────────────────────────────────────────────── */}
      <main className="relative z-10 mx-auto max-w-[1440px] px-6 py-8 lg:px-10 space-y-8">

        {/* ── Fleet Overview Panel ────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Fleet Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {fleet.map((vs) => {
              const isSelected = vs.vehicleId === selectedVehicle;
              return (
                <button
                  key={vs.vehicleId}
                  onClick={() => setSelectedVehicle(vs.vehicleId)}
                  className={`relative rounded-2xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-blue-500/50 bg-blue-500/[0.08] ring-1 ring-blue-500/30'
                      : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-zinc-300">{vs.vehicleId}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 truncate mb-2">{vs.model}</p>
                  {vs.prediction?.booking_id && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-blue-400" />
                      <span className="text-[10px] text-blue-400 font-semibold">Scheduled</span>
                    </div>
                  )}
                  {vs.predictionLoading && <Loader2 className="w-3 h-3 animate-spin text-blue-400 absolute top-2 right-2" />}
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* ── Selected Vehicle Telemetry ──────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Car className="w-4 h-4" /> {selectedVehicle} — Live Telemetry
          {current?.drivingState && (
            <span className={`ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              current.drivingState === 'idle'         ? 'bg-zinc-700/50 text-zinc-400' :
              current.drivingState === 'braking'      ? 'bg-red-500/15 text-red-400' :
              current.drivingState === 'acceleration' ? 'bg-amber-500/15 text-amber-400' :
              current.drivingState === 'highway'      ? 'bg-blue-500/15 text-blue-400' :
              'bg-emerald-500/15 text-emerald-400'
            }`}>{current.drivingState}</span>
          )}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {PARAMS.map((p, i) => (
              <TelemetryCard
                key={p.key}
                param={p}
                history={history}
                index={i}
                overrideValue={overrides[p.key as keyof typeof overrides] ?? null}
                onOverride={setOverride}
              />
            ))}
          </div>
        </section>

        {/* ── Trend Charts ───────────────────────────────────────── */}
        {history.length > 1 && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Real-Time Trend Charts</h2>
            <TrendCharts history={history} />
          </motion.section>
        )}

        {/* ── AI Prediction Panel ────────────────────────────────── */}
        {(prediction || predictionLoading) && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Brain className="w-4 h-4" />
              AI Predictive Analysis — {selectedVehicle}
              {predictionLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
            </h2>
            {prediction && (
              <div className="grid grid-cols-1 gap-4">
                {/* Diagnosis Card */}
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Wrench className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-semibold text-zinc-300">AI Diagnosis</span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line max-h-[200px] overflow-y-auto custom-scrollbar">
                    {prediction.diagnosis}
                  </p>
                  {prediction.booking_id && (
                    <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-blue-500/[0.08] border border-blue-500/20">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      <p className="text-xs text-blue-300">
                        Service auto-scheduled: <span className="font-mono font-bold">{prediction.booking_id}</span>
                      </p>
                    </div>
                  )}
                  {prediction.customer_script && (
                    <div className="mt-3 p-2 rounded-lg bg-purple-500/[0.06] border border-purple-500/20">
                      <div className="flex items-center gap-2 mb-1">
                        <Bell className="w-3 h-3 text-purple-400" />
                        <span className="text-[10px] font-bold uppercase text-purple-400">Customer Notification</span>
                      </div>
                      <p className="text-xs text-zinc-400">{prediction.customer_script}</p>
                    </div>
                  )}
                  <p className="text-xs text-zinc-600 mt-2">
                    Last analysis: {new Date(prediction.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            )}
          </motion.section>
        )}

      </main>

      {/* ── footer ────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.04] py-6 text-center text-xs text-zinc-600">
        Fleet Intelligence — Multi-Agent Predictive Maintenance System · {new Date().getFullYear()}
      </footer>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
    </div>
  );
}
