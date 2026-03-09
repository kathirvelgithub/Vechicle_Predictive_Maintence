'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import type { Alert } from '@/lib/vehicle-simulator';

const ICON: Record<Alert['type'], React.ReactNode> = {
  critical: <AlertCircle className="w-4 h-4 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  info: <Info className="w-4 h-4 text-sky-400" />,
};

const BG: Record<Alert['type'], string> = {
  critical: 'border-red-500/30 bg-red-500/[0.06]',
  warning: 'border-amber-500/30 bg-amber-500/[0.06]',
  info: 'border-sky-500/30 bg-sky-500/[0.06]',
};

interface Props {
  alerts: Alert[];
  onDismiss?: (id: string) => void;
}

export function AlertPanel({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6">
        <h3 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Alert Log
        </h3>
        <p className="text-zinc-600 text-sm text-center py-6">No alerts — all systems nominal</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-6">
      <h3 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Alert Log
        <span className="ml-auto bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full font-bold">
          {alerts.length}
        </span>
      </h3>

      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {alerts.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${BG[a.type]}`}
            >
              <span className="mt-0.5 shrink-0">{ICON[a.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 leading-tight">{a.message}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {a.parameter} = {typeof a.value === 'number' ? a.value.toFixed(1) : a.value}
                  {' · '}
                  {new Date(a.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
