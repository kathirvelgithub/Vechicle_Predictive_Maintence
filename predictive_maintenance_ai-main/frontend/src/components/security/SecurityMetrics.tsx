import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Shield, AlertTriangle, CheckCircle, Activity } from 'lucide-react';

const metrics = [
  {
    title: 'Agent API Calls (24h)',
    value: '15,642',
    change: 'Normal activity',
    icon: Activity,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    title: 'Blocked Access Attempts',
    value: '12',
    change: 'Last 24 hours',
    icon: AlertTriangle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  {
    title: 'Security Compliance Score',
    value: '98.5%',
    change: 'Within acceptable range',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    title: 'Active Security Rules',
    value: '47',
    change: 'All rules enforced',
    icon: Shield,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
];

export function SecurityMetrics() {
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
              <div className="text-sm text-slate-600">{metric.change}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
