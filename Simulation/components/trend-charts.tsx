'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { TelemetrySnapshot } from '@/lib/vehicle-simulator';

interface ChartDef {
  key: keyof TelemetrySnapshot;
  label: string;
  unit: string;
  stroke: string;
  fill: string;
  min: number;
  max: number;
}

const CHARTS: ChartDef[] = [
  {
    key: 'engineTemperature',
    label: 'Engine Temperature',
    unit: '°C',
    stroke: '#fb923c',
    fill: '#fb923c',
    min: 60,
    max: 115,
  },
  {
    key: 'rpm',
    label: 'RPM',
    unit: 'rpm',
    stroke: '#22d3ee',
    fill: '#22d3ee',
    min: 0,
    max: 5500,
  },
  {
    key: 'speed',
    label: 'Vehicle Speed',
    unit: 'km/h',
    stroke: '#60a5fa',
    fill: '#60a5fa',
    min: 0,
    max: 130,
  },
];

interface Props {
  history: TelemetrySnapshot[];
}

export function TrendCharts({ history }: Props) {
  const data = useMemo(
    () =>
      history.map((s) => ({
        time: new Date(s.timestamp).toLocaleTimeString([], {
          minute: '2-digit',
          second: '2-digit',
        }),
        engineTemperature: s.engineTemperature,
        rpm: s.rpm,
        speed: s.speed,
      })),
    [history],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {CHARTS.map((c, i) => (
        <motion.div
          key={c.key}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.1 }}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-5"
        >
          <h3 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: c.stroke }} />
            {c.label}
            <span className="text-zinc-600 ml-auto text-xs">{c.unit}</span>
          </h3>

          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={`grad-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.fill} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.fill} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[c.min, c.max]}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,15,18,0.95)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    fontSize: 12,
                    color: '#e8e8ec',
                  }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Area
                  type="monotone"
                  dataKey={c.key as string}
                  stroke={c.stroke}
                  strokeWidth={2}
                  fill={`url(#grad-${c.key})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
