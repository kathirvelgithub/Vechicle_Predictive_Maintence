import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, AlertTriangle, Calendar, Activity } from 'lucide-react';
import { api, ServiceBooking, VehicleSummary } from '../../services/api';

export function MetricsCards() {
  const [fleet, setFleet] = useState<VehicleSummary[]>([]);
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const [fleetRows, bookingRows] = await Promise.all([
        api.getFleetStatus(),
        api.getServiceBookings({ limit: 1000 }),
      ]);

      if (mounted) {
        setFleet(fleetRows);
        setBookings(bookingRows);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const metrics = useMemo(() => {
    const totalVehicles = fleet.length;
    const criticalVehicles = fleet.filter((vehicle) => vehicle.probability >= 80).length;
    const warningVehicles = fleet.filter((vehicle) => vehicle.probability >= 50 && vehicle.probability < 80).length;
    const uptime = totalVehicles > 0
      ? Math.max(0, ((totalVehicles - criticalVehicles) / totalVehicles) * 100)
      : 100;
    const confirmedBookings = bookings.filter(
      (booking) => String(booking.status || '').toLowerCase() === 'confirmed',
    ).length;
    const autoScheduledRatio = bookings.length > 0 ? (confirmedBookings / bookings.length) * 100 : 0;

    return [
      {
        title: 'Vehicle Uptime',
        value: `${uptime.toFixed(1)}%`,
        change: `${totalVehicles} tracked vehicles`,
        trend: uptime >= 95 ? 'up' : 'down',
        icon: Activity,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
      },
      {
        title: 'Predicted Failures Detected',
        value: String(criticalVehicles),
        change: `${warningVehicles} warning vehicles`,
        trend: criticalVehicles > 0 ? 'down' : 'up',
        icon: AlertTriangle,
        color: 'text-amber-600',
        bgColor: 'bg-amber-100',
      },
      {
        title: 'Autonomously Scheduled',
        value: `${Math.round(autoScheduledRatio)}%`,
        change: `${bookings.length} bookings`,
        trend: autoScheduledRatio >= 70 ? 'up' : 'neutral',
        icon: Calendar,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
      },
      {
        title: 'Open RCA Investigations',
        value: String(criticalVehicles + warningVehicles),
        change: 'Critical + warning pool',
        trend: criticalVehicles > 0 ? 'down' : 'neutral',
        icon: AlertTriangle,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
      },
    ];
  }, [bookings, fleet]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm text-slate-600">{metric.title}</CardTitle>
              <div className={`${metric.bgColor} ${metric.color} w-10 h-10 rounded-lg flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl mb-1">{metric.value}</div>
              <div className="flex items-center text-sm text-slate-600">
                {metric.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-600 mr-1" />}
                {metric.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-600 mr-1" />}
                <span>{metric.change}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
