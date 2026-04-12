import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, ClipboardCheck, Sparkles, Wrench } from 'lucide-react';
import { SchedulerCalendar } from './SchedulerCalendar';
import { DemandForecast } from './DemandForecast';
import { api, SchedulingRecommendation, ServiceBooking, VehicleSummary } from '../../services/api';
import { stream } from '../../services/stream';
import { Card, CardContent } from '../ui/card';

export function Scheduling() {
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
        api.getPendingRecommendations().catch(() => []),
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
  }, [refreshToken]);

  useEffect(() => {
    stream.start();
    const unsubscribe = stream.subscribe((event) => {
      const topic = String(event.topic || '').toLowerCase();
      if (!topic.startsWith('scheduling.') && topic !== 'notification.created') {
        return;
      }
      setRefreshToken((value) => value + 1);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const snapshotCards = useMemo(() => {
    const toLocalDateKey = (value: string | Date): string => {
      const source =
        value instanceof Date
          ? value
          : new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
      if (Number.isNaN(source.getTime())) {
        return '';
      }
      return `${source.getFullYear()}-${String(source.getMonth() + 1).padStart(2, '0')}-${String(source.getDate()).padStart(2, '0')}`;
    };

    const todayKey = toLocalDateKey(new Date());
    const todayBookings = bookings.filter((booking) => toLocalDateKey(String(booking.scheduled_date || '')) === todayKey);
    const highRiskVehicles = fleet.filter((vehicle) => Number(vehicle.probability || 0) >= 70).length;

    return [
      {
        label: 'Pending Approvals',
        value: `${pendingRecommendations.length}`,
        detail: 'System-wide recommendations waiting decision',
        icon: ClipboardCheck,
        tone: 'border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-100 text-sky-900',
      },
      {
        label: "Today's Bookings",
        value: `${todayBookings.length}`,
        detail: 'Scheduled service slots today',
        icon: CalendarClock,
        tone: 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 text-emerald-900',
      },
      {
        label: 'High Risk Fleet',
        value: `${highRiskVehicles}`,
        detail: 'Vehicles with risk score >= 70',
        icon: Activity,
        tone: 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-rose-100 text-rose-900',
      },
      {
        label: 'Total Active Fleet',
        value: `${fleet.length}`,
        detail: 'Vehicles connected to scheduler',
        icon: Wrench,
        tone: 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100 text-amber-900',
      },
    ];
  }, [bookings, fleet, pendingRecommendations.length]);

  return (
    <div className="space-y-6 rounded-3xl bg-[radial-gradient(circle_at_top_left,_#f0f9ff_0%,_#f8fafc_42%,_#eef2ff_100%)] p-3 md:p-5">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/90 px-6 py-5 shadow-sm backdrop-blur">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-100/70 blur-2xl" />
        <div className="absolute -bottom-10 left-12 h-24 w-24 rounded-full bg-emerald-100/60 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Service Scheduling Command Center</h1>
            <p className="mt-2 text-sm text-slate-600">Plan bay utilization, monitor booking pressure, and keep throughput balanced in real time.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
            <Sparkles className="h-4 w-4" />
            Live Dispatch View
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {snapshotCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className={`group min-h-[132px] border shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">{card.label}</p>
                  <div className="rounded-full border border-white/70 bg-white/70 p-2 shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-3 text-3xl font-bold leading-none tracking-tight">{card.value}</p>
                <p className="mt-2 text-xs opacity-80">{card.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* The Calendar Component */}
      <SchedulerCalendar refreshToken={refreshToken} />

      <DemandForecast />
    </div>
  );
}