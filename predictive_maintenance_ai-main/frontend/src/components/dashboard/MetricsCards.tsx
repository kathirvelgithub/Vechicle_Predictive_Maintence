import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, AlertTriangle, Calendar, Activity } from 'lucide-react';


const metrics = [
  {
    title: 'Vehicle Uptime',
    value: '98.5%',
    change: '+2.3%',
    trend: 'up',
    icon: Activity,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    title: 'Predicted Failures Detected',
    value: '145',
    change: 'Today',
    trend: 'neutral',
    icon: AlertTriangle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  {
    title: 'Autonomously Scheduled',
    value: '85%',
    change: 'of bookings',
    trend: 'up',
    icon: Calendar,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    title: 'Open RCA Investigations',
    value: '12',
    change: '3 new this week',
    trend: 'neutral',
    icon: AlertTriangle,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
];

export function MetricsCards() {
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
