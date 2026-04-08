import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, ClipboardCheck, Wrench } from 'lucide-react';
import { SchedulerCalendar } from './SchedulerCalendar';
import { SchedulingApprovalInbox } from './SchedulingApprovalInbox';
import { DemandForecast } from './DemandForecast';
import { useAuth } from '../../context/AuthContext';
import { api, SchedulingRecommendation, ServiceBooking, VehicleSummary } from '../../services/api';
import { Card, CardContent } from '../ui/card';

export function Scheduling() {
  const { user } = useAuth();
  const [refreshToken, setRefreshToken] = useState(0);
  const [fleet, setFleet] = useState<VehicleSummary[]>([]);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);
  const [pendingRecommendations, setPendingRecommendations] = useState<SchedulingRecommendation[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadSummary = async () => {
      const [fleetRows, bookingRows, pendingRows] = await Promise.all([
        api.getFleetStatus(),
        api.getServiceBookings({ limit: 1000 }),
        api.getPendingRecommendations(user?.email).catch(() => []),
      ]);

      if (!mounted) {
        return;
      }

      setFleet(fleetRows);
      setBookings(bookingRows);
      setPendingRecommendations(pendingRows);
    };

    void loadSummary();
    const timer = window.setInterval(() => {
      void loadSummary();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [refreshToken, user?.email]);

  const snapshotCards = useMemo(() => {
    const todayKey = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter((booking) => String(booking.scheduled_date || '').startsWith(todayKey));
    const highRiskVehicles = fleet.filter((vehicle) => Number(vehicle.probability || 0) >= 70).length;

    return [
      {
        label: 'Pending Approvals',
        value: `${pendingRecommendations.length}`,
        detail: 'Recommendations waiting decision',
        icon: ClipboardCheck,
        tone: 'border-blue-200 bg-blue-50 text-blue-900',
      },
      {
        label: "Today's Bookings",
        value: `${todayBookings.length}`,
        detail: 'Scheduled service slots today',
        icon: CalendarClock,
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      },
      {
        label: 'High Risk Fleet',
        value: `${highRiskVehicles}`,
        detail: 'Vehicles with risk score >= 70',
        icon: Activity,
        tone: 'border-rose-200 bg-rose-50 text-rose-900',
      },
      {
        label: 'Total Active Fleet',
        value: `${fleet.length}`,
        detail: 'Vehicles connected to scheduler',
        icon: Wrench,
        tone: 'border-amber-200 bg-amber-50 text-amber-900',
      },
    ];
  }, [bookings, fleet, pendingRecommendations.length]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Service Scheduling Command Center</h1>
        <p className="mt-2 text-sm text-slate-600">Plan bay utilization, approve AI recommendations, and monitor 30-day demand in one workflow.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {snapshotCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`min-h-[128px] border ${card.tone}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
                  <Icon className="h-4 w-4" />
                </div>
                <p className="mt-2 text-2xl font-bold leading-none">{card.value}</p>
                <p className="mt-1 text-xs opacity-80">{card.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <SchedulingApprovalInbox
        defaultApprover={user?.email}
        onDecisionComplete={() => setRefreshToken((value) => value + 1)}
      />

      {/* The Calendar Component */}
      <SchedulerCalendar refreshToken={refreshToken} />

      <DemandForecast />
    </div>
  );
}