'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  Thermometer,
  Gauge,
  Zap,
  Battery,
  Droplet,
  Fuel,
  Activity,
  CircleDot,
  Wind,
  Pencil,
  Lock,
  X,
  Check,
} from 'lucide-react';
import type { TelemetrySnapshot, TelemetryReading } from '@/lib/vehicle-simulator';

// ── parameter definitions ─────────────────────────────────────────────
export interface ParamDef {
  key: keyof TelemetrySnapshot;
  label: string;
  unit: string;
  icon: React.ReactNode;
  color: string;        // tailwind text
  stroke: string;       // hex for sparkline
  min: number;
  max: number;
  warningAbove?: number;
  warningBelow?: number;
  criticalAbove?: number;
  criticalBelow?: number;
  decimals?: number;
}

export const PARAMS: ParamDef[] = [
  {
    key: 'engineTemperature',
    label: 'Engine Temp',
    unit: '°C',
    icon: <Thermometer className="w-5 h-5" />,
    color: 'text-orange-400',
    stroke: '#fb923c',
    min: 70, max: 110,
    warningAbove: 98,
    criticalAbove: 105,
  },
  {
    key: 'rpm',
    label: 'RPM',
    unit: 'rpm',
    icon: <Gauge className="w-5 h-5" />,
    color: 'text-cyan-400',
    stroke: '#22d3ee',
    min: 800, max: 5000,
    warningAbove: 4500,
  },
  {
    key: 'speed',
    label: 'Speed',
    unit: 'km/h',
    icon: <Zap className="w-5 h-5" />,
    color: 'text-blue-400',
    stroke: '#60a5fa',
    min: 0, max: 120,
  },
  {
    key: 'batteryVoltage',
    label: 'Battery',
    unit: 'V',
    icon: <Battery className="w-5 h-5" />,
    color: 'text-green-400',
    stroke: '#4ade80',
    min: 11.5, max: 13.5,
    warningBelow: 12.0,
    criticalBelow: 11.5,
    decimals: 2,
  },
  {
    key: 'oilPressure',
    label: 'Oil Pressure',
    unit: 'psi',
    icon: <Droplet className="w-5 h-5" />,
    color: 'text-yellow-400',
    stroke: '#facc15',
    min: 20, max: 60,
    warningBelow: 25,
    criticalBelow: 15,
  },
  {
    key: 'fuelLevel',
    label: 'Fuel Level',
    unit: '%',
    icon: <Fuel className="w-5 h-5" />,
    color: 'text-emerald-400',
    stroke: '#34d399',
    min: 0, max: 100,
    warningBelow: 15,
  },
  {
    key: 'engineLoad',
    label: 'Engine Load',
    unit: '%',
    icon: <Activity className="w-5 h-5" />,
    color: 'text-purple-400',
    stroke: '#c084fc',
    min: 0, max: 100,
    warningAbove: 90,
  },
  {
    key: 'tirePressure',
    label: 'Tire Pressure',
    unit: 'psi',
    icon: <CircleDot className="w-5 h-5" />,
    color: 'text-pink-400',
    stroke: '#f472b6',
    min: 28, max: 36,
    warningBelow: 29,
    decimals: 1,
  },
  {
    key: 'coolantTemperature',
    label: 'Coolant Temp',
    unit: '°C',
    icon: <Wind className="w-5 h-5" />,
    color: 'text-sky-400',
    stroke: '#38bdf8',
    min: 70, max: 105,
    warningAbove: 100,
  },
];

// ── status helper ─────────────────────────────────────────────────────
function statusFor(value: number, p: ParamDef): 'healthy' | 'warning' | 'critical' {
  if (p.criticalAbove !== undefined && value > p.criticalAbove) return 'critical';
  if (p.criticalBelow !== undefined && value < p.criticalBelow) return 'critical';
  if (p.warningAbove !== undefined && value > p.warningAbove) return 'warning';
  if (p.warningBelow !== undefined && value < p.warningBelow) return 'warning';
  return 'healthy';
}

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-emerald-500 shadow-emerald-500/60',
  warning: 'bg-amber-500 shadow-amber-500/60',
  critical: 'bg-red-500 shadow-red-500/60',
};

// ── card component ────────────────────────────────────────────────────
interface Props {
  param: ParamDef;
  history: TelemetrySnapshot[];
  index: number;
  overrideValue?: number | null;
  onOverride: (key: keyof TelemetryReading, value: number | null) => void;
}

export function TelemetryCard({ param, history, index, overrideValue, onOverride }: Props) {
  const latest   = history.at(-1);
  const simValue = latest ? (latest[param.key] as number) : 0;
  const isOverridden = overrideValue !== undefined && overrideValue !== null;
  const value    = isOverridden ? overrideValue : simValue;
  const status   = latest ? statusFor(value, param) : 'healthy';
  const decimals = param.decimals ?? 0;

  // Local editing state
  const [editing, setEditing]     = useState(false);
  const [editValue, setEditValue] = useState<number>(value);

  const openEditor = useCallback(() => {
    setEditValue(value);
    setEditing(true);
  }, [value]);

  const applyOverride = useCallback(() => {
    onOverride(param.key as keyof TelemetryReading, editValue);
    setEditing(false);
  }, [editValue, onOverride, param.key]);

  const clearOverride = useCallback(() => {
    onOverride(param.key as keyof TelemetryReading, null);
    setEditing(false);
  }, [onOverride, param.key]);

  const step   = param.decimals ? 0.1 : 1;
  const range  = param.max - param.min;

  const sparkData = useMemo(
    () => history.slice(-30).map((s) => ({ v: s[param.key] as number })),
    [history, param.key],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 260, damping: 24 }}
      whileHover={{ scale: 1.03, y: -4 }}
      className="relative group rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5 flex flex-col gap-3 overflow-hidden transition-shadow duration-300 hover:shadow-[0_0_40px_-12px_rgba(56,189,248,0.25)]"
    >
      {/* Glow accent */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(600px circle at var(--mouse-x,50%) var(--mouse-y,50%), ${param.stroke}18, transparent 40%)`,
        }}
      />

      {/* Overridden banner */}
      {isOverridden && (
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-amber-500/60 via-amber-400/80 to-amber-500/60" />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={param.color}>{param.icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{param.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px] ${STATUS_DOT[status]} ${status !== 'healthy' ? 'animate-pulse' : ''}`} />
          {/* Override controls */}
          {isOverridden ? (
            <button
              onClick={clearOverride}
              title="Clear manual override"
              className="p-1 rounded-md hover:bg-amber-500/10 transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            </button>
          ) : (
            <button
              onClick={openEditor}
              title="Set manual override"
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/[0.08] transition-all"
            >
              <Pencil className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          )}
        </div>
      </div>

      {/* Value */}
      <div className="flex items-end gap-1.5">
        <span className={`text-3xl font-black tracking-tight tabular-nums ${isOverridden ? 'text-amber-300' : 'text-white'}`}>
          {value.toFixed(decimals)}
        </span>
        <span className="text-sm font-medium text-zinc-500 mb-1">{param.unit}</span>
        {isOverridden && (
          <span className="ml-1 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">pinned</span>
        )}
      </div>

      {/* Manual override input panel */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.05] border border-white/[0.10]"
        >
          {/* Range label */}
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>{param.min} {param.unit}</span>
            <span className="font-bold text-zinc-300">{editValue.toFixed(decimals)} {param.unit}</span>
            <span>{param.max} {param.unit}</span>
          </div>
          {/* Range slider */}
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={step}
            value={editValue}
            onChange={(e) => setEditValue(Number(e.target.value))}
            className="w-full h-1.5 accent-blue-500 cursor-pointer"
          />
          {/* Number input + action buttons */}
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={param.min}
              max={param.max}
              step={step}
              value={editValue}
              onChange={(e) => setEditValue(Number(e.target.value))}
              className="w-20 bg-transparent border border-white/[0.12] rounded-lg px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50"
            />
            <span className="text-xs text-zinc-500 flex-1">{param.unit}</span>
            <button
              onClick={applyOverride}
              className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-white font-bold transition-colors"
            >
              <Check className="w-3 h-3" /> Set
            </button>
            <button
              onClick={() => setEditing(false)}
              className="p-1.5 rounded-lg hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      {/* Sparkline */}
      {!editing && sparkData.length > 1 && (
        <div className="h-10 -mx-1 mt-auto">
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={isOverridden ? '#f59e0b' : param.stroke}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
