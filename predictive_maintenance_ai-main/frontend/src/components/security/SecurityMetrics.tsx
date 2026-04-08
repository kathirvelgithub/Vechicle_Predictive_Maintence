import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Shield, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { api, ActivityLog, NotificationItem } from '../../services/api';
import { stream } from '../../services/stream';

export function SecurityMetrics() {
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [streamConnected, setStreamConnected] = useState(false);

  useEffect(() => {
    stream.start();
    const unsubscribeConnection = stream.subscribeConnection((connected) => {
      setStreamConnected(connected);
    });

    let mounted = true;

    const load = async () => {
      const [activityRows, notificationRows] = await Promise.all([
        api.getAgentActivity(),
        api.getNotifications({ limit: 200 }),
      ]);

      if (mounted) {
        setActivity(activityRows);
        setNotifications(notificationRows);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      unsubscribeConnection();
    };
  }, []);

  const metrics = useMemo(() => {
    const criticalAlerts = notifications.filter(
      (item) => String(item.notification_type || '').toLowerCase() === 'critical',
    ).length;

    const openWarnings = notifications.filter((item) => {
      const type = String(item.notification_type || '').toLowerCase();
      return type === 'warning' || type === 'alert' || type === 'approval_required';
    }).length;

    const reviewedCount = notifications.filter((item) => Boolean(item.acknowledged || item.read)).length;
    const reviewRate = notifications.length > 0 ? Math.round((reviewedCount / notifications.length) * 100) : 100;

    const warningCount = activity.filter((item) => item.type === 'warning' || item.type === 'alert').length;
    const complianceScore = activity.length > 0
      ? Math.max(0, Math.round(((activity.length - warningCount) / activity.length) * 1000) / 10)
      : 100;

    return [
      {
        title: 'Open Critical Incidents',
        value: String(criticalAlerts),
        change: 'Immediate response queue',
        icon: Activity,
        color: 'text-rose-700',
        bgColor: 'bg-rose-100',
      },
      {
        title: 'Open Warning Alerts',
        value: String(openWarnings),
        change: 'Requires operator review',
        icon: AlertTriangle,
        color: 'text-amber-700',
        bgColor: 'bg-amber-100',
      },
      {
        title: 'Reviewed Alert Ratio',
        value: `${reviewRate}%`,
        change: `${reviewedCount}/${notifications.length || 0} reviewed`,
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
      },
      {
        title: 'Security Posture Score',
        value: `${complianceScore}%`,
        change: streamConnected ? 'Realtime stream connected' : 'Realtime stream reconnecting',
        icon: Shield,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
      },
    ];
  }, [activity, notifications, streamConnected]);

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
