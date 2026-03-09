import React from 'react';
import { SchedulerCalendar } from './SchedulerCalendar';

export function Scheduling() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2 font-bold text-slate-900">Service Scheduling & Demand Forecasting</h1>
        <p className="text-slate-600">AI-powered scheduling optimization and capacity planning</p>
      </div>

      {/* The Calendar Component */}
      <SchedulerCalendar />
    </div>
  );
}