import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Wrench, Phone, Calendar, Shield, CheckCircle, AlertCircle } from 'lucide-react';


const activities = [
  {
    id: 1,
    time: '10:45 AM',
    agent: 'Diagnosis Agent',
    action: 'identified likely transmission slip',
    target: 'VIN#MH04XY1234',
    icon: Wrench,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    id: 2,
    time: '10:46 AM',
    agent: 'Customer Engagement Agent',
    action: 'initiated voice call',
    target: 'Customer: Rajesh Kumar',
    icon: Phone,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    id: 3,
    time: '10:52 AM',
    agent: 'Scheduling Agent',
    action: 'booked service slot',
    target: '14/12 at Chennai Center',
    icon: Calendar,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    id: 4,
    time: '11:02 AM',
    agent: 'Security Agent (UEBA)',
    action: 'blocked unauthorized API access',
    target: 'Flagged for review',
    icon: Shield,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  {
    id: 5,
    time: '11:15 AM',
    agent: 'Diagnosis Agent',
    action: 'detected battery voltage critical',
    target: 'VIN#DL12AB5678',
    icon: AlertCircle,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  {
    id: 6,
    time: '11:22 AM',
    agent: 'Scheduling Agent',
    action: 'optimized 8 appointment slots',
    target: 'Mumbai West Center',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    id: 7,
    time: '11:30 AM',
    agent: 'Customer Engagement Agent',
    action: 'confirmed appointment via SMS',
    target: 'Customer: Priya Sharma',
    icon: CheckCircle,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    id: 8,
    time: '11:45 AM',
    agent: 'Diagnosis Agent',
    action: 'analyzed engine vibration patterns',
    target: 'VIN#KA09CD9012',
    icon: Wrench,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    id: 9,
    time: '12:01 PM',
    agent: 'Monitoring Agent',
    action: 'scanned live telemetry data',
    target: '3,456 active vehicles',
    icon: CheckCircle,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    id: 10,
    time: '12:15 PM',
    agent: 'Scheduling Agent',
    action: 'rescheduled due to capacity',
    target: '16/12 at Delhi NCR Center',
    icon: Calendar,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
];

export function ActivityFeed() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Real-Time Activity Feed</CardTitle>
          <Badge variant="secondary" className="animate-pulse">Live</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {activities.map((activity) => {
              const Icon = activity.icon;
              return (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100"
                >
                  <div className={`${activity.bgColor} ${activity.color} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-blue-600">{activity.agent}</span>
                      <span className="text-xs text-slate-500">{activity.time}</span>
                    </div>
                    <p className="text-sm text-slate-700">
                      {activity.action}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      → {activity.target}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
