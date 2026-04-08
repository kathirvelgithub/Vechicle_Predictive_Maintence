import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'; // ✅ Fixed path
import { Badge } from '../ui/badge'; // ✅ Fixed path
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { api, ServiceBooking } from '../../services/api';

interface ForecastPoint {
  date: string;
  demand: number;
  capacity: number;
  actual: number | null;
}

const DAILY_CAPACITY = 16;

const toDayKey = (value: Date): string => {
  const clone = new Date(value.getTime() - (value.getTimezoneOffset() * 60000));
  return clone.toISOString().split('T')[0];
};

const buildForecastSeries = (bookings: ServiceBooking[]): ForecastPoint[] => {
  const now = new Date();
  const demandByDay = new Map<string, number>();

  bookings.forEach((booking) => {
    const scheduled = new Date(booking.scheduled_date);
    if (Number.isNaN(scheduled.getTime())) {
      return;
    }

    const key = toDayKey(scheduled);
    demandByDay.set(key, (demandByDay.get(key) || 0) + 1);
  });

  return Array.from({ length: 30 }).map((_, index) => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + index);

    const key = toDayKey(day);
    const demand = demandByDay.get(key) || 0;
    const dateLabel = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return {
      date: dateLabel,
      demand,
      capacity: DAILY_CAPACITY,
      actual: index === 0 ? demand : null,
    };
  });
};

export function DemandForecast() {
  const [bookings, setBookings] = useState<ServiceBooking[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const rows = await api.getServiceBookings({ limit: 1000 });
      if (mounted) {
        setBookings(rows);
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

  const forecastData = useMemo(() => buildForecastSeries(bookings), [bookings]);
  const overCapacityDays = forecastData.filter((d) => d.demand > d.capacity).length;
  const today = forecastData[0] || { demand: 0, capacity: DAILY_CAPACITY };
  const peak = forecastData.reduce(
    (current, entry) => (entry.demand > current.demand ? entry : current),
    forecastData[0] || { date: 'N/A', demand: 0 },
  );
  const autoScheduledRate = bookings.length > 0
    ? Math.round(
        (bookings.filter((booking) => String(booking.status || '').toLowerCase() === 'confirmed').length /
          bookings.length) *
          100,
      )
    : 0;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Demand vs Capacity (Next 30 Days)</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Decision support for workload balancing and staffing.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-slate-600">Capacity Alert</p>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-red-600" />
                <span className="text-red-600 font-bold">{overCapacityDays} days over capacity</span>
              </div>
            </div>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              AI Forecast Active
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={forecastData}>
            <defs>
              <linearGradient id="colorDemand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorCapacity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} interval={2} />
            <YAxis label={{ value: 'Service Appointments', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="capacity"
              stroke="#10b981"
              fill="url(#colorCapacity)"
              name="Service Center Capacity"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="demand"
              stroke="#3b82f6"
              fill="url(#colorDemand)"
              name="Predicted Demand"
              strokeWidth={2}
            />
            {forecastData[0].actual && (
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#8b5cf6"
                name="Actual Bookings"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
        
        {/* KPI Summary */}
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Today's Demand</p>
            <p className="text-2xl text-blue-600 font-bold">{today.demand}</p>
            <p className="text-xs text-blue-600 mt-1">
              {Math.min(999, Math.round((today.demand / Math.max(1, today.capacity)) * 100))}% of capacity
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Peak Day ({peak.date})</p>
            <p className="text-2xl text-amber-600 font-bold">{peak.demand}</p>
            <p className="text-xs text-amber-600 mt-1">
              {Math.min(999, Math.round((peak.demand / Math.max(1, DAILY_CAPACITY)) * 100))}% of capacity
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Current Capacity</p>
            <p className="text-2xl text-green-600 font-bold">{DAILY_CAPACITY}</p>
            <p className="text-xs text-green-600 mt-1">per day</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Auto-Scheduled</p>
            <p className="text-2xl text-purple-600 font-bold">{autoScheduledRate}%</p>
            <p className="text-xs text-purple-600 mt-1">confirmed booking ratio</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}