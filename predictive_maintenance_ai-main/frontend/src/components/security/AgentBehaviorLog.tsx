import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { api, ActivityLog } from '../../services/api';

const toStatus = (type: ActivityLog['type']): 'success' | 'warning' | 'blocked' => {
  if (type === 'alert') {
    return 'blocked';
  }
  if (type === 'warning') {
    return 'warning';
  }
  return 'success';
};

const formatTime = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleTimeString();
};

export function AgentBehaviorLog() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const rows = await api.getAgentActivity();
      if (mounted) {
        setLogs(rows);
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

  return (
    <Card id="agent-api-activity-log">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Agent API Activity Log</CardTitle>
          <Badge variant="secondary" className="bg-slate-100">
            Real-time Monitoring
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          <div className="font-mono text-xs space-y-1">
            {logs.map((log) => (
              (() => {
                const status = toStatus(log.type);
                return (
              <div
                key={log.id}
                className={`flex items-start space-x-3 p-2 rounded hover:bg-slate-50 ${
                  status === 'blocked' ? 'bg-red-50 border-l-4 border-red-500' : ''
                }`}
              >
                <span className="text-slate-500 w-16 flex-shrink-0">{formatTime(log.time)}</span>
                <div className="flex-shrink-0">
                  {status === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
                  {status === 'blocked' && <XCircle className="w-4 h-4 text-red-600" />}
                  {status === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600" />}
                </div>
                <span className="text-blue-600 w-48 flex-shrink-0">{log.agent}</span>
                <span className="flex-1">{log.message}</span>
                <Badge
                  variant="secondary"
                  className={`flex-shrink-0 ${
                    status === 'success'
                      ? 'bg-green-100 text-green-700'
                      : status === 'blocked'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {status.toUpperCase()}
                </Badge>
                <span className="text-slate-500 flex-shrink-0">• {log.vehicle_id}</span>
              </div>
                );
              })()
            ))}
            {logs.length === 0 && (
              <div className="text-sm text-slate-500 p-3">No activity logs are available yet.</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
