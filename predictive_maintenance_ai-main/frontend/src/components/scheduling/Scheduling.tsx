import React, { useState } from 'react';
import { SchedulerCalendar } from './SchedulerCalendar';
import { SchedulingApprovalInbox } from './SchedulingApprovalInbox';
import { useAuth } from '../../context/AuthContext';

export function Scheduling() {
  const { user } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2 font-bold text-slate-900">Service Scheduling & Demand Forecasting</h1>
        <p className="text-slate-600">AI-powered scheduling optimization and capacity planning</p>
      </div>

      <SchedulingApprovalInbox
        defaultApprover={user?.email}
        onDecisionComplete={() => setRefreshToken((value) => value + 1)}
      />

      {/* The Calendar Component */}
      <SchedulerCalendar refreshToken={refreshToken} />
    </div>
  );
}