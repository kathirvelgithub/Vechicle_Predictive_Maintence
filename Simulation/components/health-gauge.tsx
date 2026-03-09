'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  score: number;
  status: 'healthy' | 'warning' | 'critical';
}

const COLOR: Record<string, { ring: string; text: string; glow: string; bg: string }> = {
  healthy:  { ring: 'stroke-emerald-500', text: 'text-emerald-400', glow: 'shadow-emerald-500/30', bg: 'from-emerald-500/10' },
  warning:  { ring: 'stroke-amber-500',   text: 'text-amber-400',   glow: 'shadow-amber-500/30',   bg: 'from-amber-500/10' },
  critical: { ring: 'stroke-red-500',      text: 'text-red-400',      glow: 'shadow-red-500/30',      bg: 'from-red-500/10' },
};

export function HealthGauge({ score, status }: Props) {
  const c = COLOR[status];
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22 }}
      className={`relative rounded-2xl border border-white/[0.06] bg-gradient-to-b ${c.bg} to-transparent backdrop-blur-xl p-8 flex flex-col items-center justify-center gap-4 shadow-xl ${c.glow}`}
    >
      {/* SVG ring */}
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle
            cx="60" cy="60" r="54"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="8"
          />
          <motion.circle
            cx="60" cy="60" r="54"
            fill="none"
            className={c.ring}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeInOut' }}
          />
        </svg>
        {/* Centre text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={score}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-4xl font-black tabular-nums ${c.text}`}
          >
            {score}
          </motion.span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Health
          </span>
        </div>
      </div>

      {/* Status label */}
      <span
        className={`text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full ${status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : status === 'warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}
      >
        {status}
      </span>
    </motion.div>
  );
}
