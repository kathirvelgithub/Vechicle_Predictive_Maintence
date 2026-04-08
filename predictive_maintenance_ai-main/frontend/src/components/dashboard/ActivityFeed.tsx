import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Wrench, Phone, Calendar, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { api, ActivityLog } from '../../services/api';


const toVisual = (item: ActivityLog) => {
  const normalizedType = String(item.type || '').toLowerCase();
  if (normalizedType === 'alert') {
    return { icon: Shield, color: 'text-red-600', bgColor: 'bg-red-100' };
  }
  if (normalizedType === 'warning') {
    return { icon: AlertCircle, color: 'text-amber-600', bgColor: 'bg-amber-100' };
  }

  const normalizedAgent = String(item.agent || '').toLowerCase();
  if (normalizedAgent.includes('diagnosis')) {
    return { icon: Wrench, color: 'text-green-600', bgColor: 'bg-green-100' };
  }
  if (normalizedAgent.includes('scheduling')) {
    return { icon: Calendar, color: 'text-purple-600', bgColor: 'bg-purple-100' };
  }
  if (normalizedAgent.includes('customer')) {
    return { icon: Phone, color: 'text-blue-600', bgColor: 'bg-blue-100' };
  }

  return { icon: CheckCircle, color: 'text-blue-600', bgColor: 'bg-blue-100' };
};

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const rows = await api.getAgentActivity();
      if (mounted) {
        setActivities(rows);
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

  const formattedActivities = useMemo(() => {
    return activities.map((activity) => {
      const visual = toVisual(activity);
      const parsed = new Date(activity.time);
      return {
        ...activity,
        ...visual,
        displayTime: Number.isNaN(parsed.getTime()) ? activity.time : parsed.toLocaleTimeString(),
      };
    });
  }, [activities]);

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
            {formattedActivities.map((activity) => {
              const Icon = activity.icon;
              return (
                <div
                  key={activity.id || `${activity.vehicle_id}-${activity.time}`}
                  className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100"
                >
                  <div className={`${activity.bgColor} ${activity.color} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-blue-600">{activity.agent}</span>
                      <span className="text-xs text-slate-500">{activity.displayTime}</span>
                    </div>
                    <p className="text-sm text-slate-700">
                      {activity.message}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      → {activity.vehicle_id}
                    </p>
                  </div>
                </div>
              );
            })}
            {formattedActivities.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                No activity events available from backend.
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
