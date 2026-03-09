import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'; // ✅ Fixed path
import { Badge } from '../ui/badge'; // ✅ Fixed path
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from 'recharts';
import { TrendingUp } from 'lucide-react';

// Static Data for Demo (You can replace this with API data later)
const forecastData = [
  { date: 'Dec 12', demand: 145, capacity: 180, actual: 142 },
  { date: 'Dec 13', demand: 158, capacity: 180, actual: null },
  { date: 'Dec 14', demand: 172, capacity: 180, actual: null },
  { date: 'Dec 15', demand: 165, capacity: 180, actual: null },
  { date: 'Dec 16', demand: 148, capacity: 180, actual: null },
  { date: 'Dec 17', demand: 132, capacity: 180, actual: null },
  { date: 'Dec 18', demand: 125, capacity: 180, actual: null },
  { date: 'Dec 19', demand: 155, capacity: 180, actual: null },
  { date: 'Dec 20', demand: 168, capacity: 180, actual: null },
  { date: 'Dec 21', demand: 175, capacity: 180, actual: null },
  { date: 'Dec 22', demand: 182, capacity: 180, actual: null },
  { date: 'Dec 23', demand: 195, capacity: 180, actual: null },
  { date: 'Dec 24', demand: 178, capacity: 180, actual: null },
  { date: 'Dec 25', demand: 140, capacity: 180, actual: null },
  { date: 'Dec 26', demand: 162, capacity: 180, actual: null },
  { date: 'Dec 27', demand: 171, capacity: 180, actual: null },
  { date: 'Dec 28', demand: 188, capacity: 180, actual: null },
  { date: 'Dec 29', demand: 192, capacity: 180, actual: null },
  { date: 'Dec 30', demand: 185, capacity: 180, actual: null },
  { date: 'Dec 31', demand: 165, capacity: 180, actual: null },
  { date: 'Jan 1', demand: 120, capacity: 180, actual: null },
  { date: 'Jan 2', demand: 145, capacity: 180, actual: null },
  { date: 'Jan 3', demand: 158, capacity: 180, actual: null },
  { date: 'Jan 4', demand: 168, capacity: 180, actual: null },
  { date: 'Jan 5', demand: 175, capacity: 180, actual: null },
  { date: 'Jan 6', demand: 182, capacity: 180, actual: null },
  { date: 'Jan 7', demand: 177, capacity: 180, actual: null },
  { date: 'Jan 8', demand: 172, capacity: 180, actual: null },
  { date: 'Jan 9', demand: 168, capacity: 180, actual: null },
  { date: 'Jan 10', demand: 165, capacity: 180, actual: null },
];

export function DemandForecast() {
  const overCapacityDays = forecastData.filter((d) => d.demand > d.capacity).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Service Demand Forecast (Next 30 Days)</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Predicted based on vehicle usage patterns, maintenance schedules, and AI failure predictions
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
        <ResponsiveContainer width="100%" height={350}>
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
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Today's Demand</p>
            <p className="text-2xl text-blue-600 font-bold">145</p>
            <p className="text-xs text-blue-600 mt-1">80.5% of capacity</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Peak Day (Dec 23)</p>
            <p className="text-2xl text-amber-600 font-bold">195</p>
            <p className="text-xs text-amber-600 mt-1">108% of capacity</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Current Capacity</p>
            <p className="text-2xl text-green-600 font-bold">180</p>
            <p className="text-xs text-green-600 mt-1">per day</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Auto-Scheduled</p>
            <p className="text-2xl text-purple-600 font-bold">85%</p>
            <p className="text-xs text-purple-600 mt-1">by AI agents</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}