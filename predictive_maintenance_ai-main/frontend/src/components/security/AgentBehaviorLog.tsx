import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const logs = [
  { id: 1, time: '11:02:15', agent: 'Scheduling Agent', action: 'POST /api/telematics/raw', status: 'blocked', reason: 'Unauthorized scope' },
  { id: 2, time: '11:01:58', agent: 'Diagnosis Agent', action: 'GET /api/vehicles/MH04XY1234/health', status: 'success', reason: null },
  { id: 3, time: '11:01:45', agent: 'Customer Engagement Agent', action: 'POST /api/calls/initiate', status: 'success', reason: null },
  { id: 4, time: '11:01:32', agent: 'Monitoring Agent', action: 'GET /api/telemetry/live', status: 'success', reason: null },
  { id: 5, time: '11:01:20', agent: 'Scheduling Agent', action: 'POST /api/appointments/create', status: 'success', reason: null },
  { id: 6, time: '11:01:05', agent: 'Security Agent', action: 'GET /api/security/audit-log', status: 'success', reason: null },
  { id: 7, time: '11:00:48', agent: 'Diagnosis Agent', action: 'GET /api/diagnostic-codes/P0700', status: 'success', reason: null },
  { id: 8, time: '11:00:35', agent: 'Customer Engagement Agent', action: 'POST /api/notifications/send', status: 'success', reason: null },
  { id: 9, time: '11:00:22', agent: 'Monitoring Agent', action: 'GET /api/fleet/status', status: 'success', reason: null },
  { id: 10, time: '11:00:10', agent: 'Scheduling Agent', action: 'GET /api/service-centers/capacity', status: 'success', reason: null },
  { id: 11, time: '10:59:58', agent: 'Diagnosis Agent', action: 'POST /api/analytics/predict', status: 'success', reason: null },
  { id: 12, time: '10:59:45', agent: 'Customer Engagement Agent', action: 'GET /api/customers/DL12AB5678/contact', status: 'success', reason: null },
  { id: 13, time: '10:59:32', agent: 'Monitoring Agent', action: 'GET /api/telemetry/historical', status: 'success', reason: null },
  { id: 14, time: '10:59:20', agent: 'Security Agent', action: 'POST /api/security/validate-token', status: 'success', reason: null },
  { id: 15, time: '10:59:08', agent: 'Scheduling Agent', action: 'PATCH /api/appointments/update/12345', status: 'success', reason: null },
  { id: 16, time: '10:58:55', agent: 'Diagnosis Agent', action: 'GET /api/vehicles/batch/health-check', status: 'success', reason: null },
  { id: 17, time: '10:58:42', agent: 'Customer Engagement Agent', action: 'POST /api/sms/send', status: 'success', reason: null },
  { id: 18, time: '10:58:30', agent: 'Monitoring Agent', action: 'GET /api/alerts/active', status: 'warning', reason: 'Rate limit approaching' },
  { id: 19, time: '10:58:18', agent: 'Scheduling Agent', action: 'GET /api/service-centers/MUM-CENTRAL/slots', status: 'success', reason: null },
  { id: 20, time: '10:58:05', agent: 'Diagnosis Agent', action: 'POST /api/database/write', status: 'blocked', reason: 'Read-only permission' },
];

export function AgentBehaviorLog() {
  return (
    <Card>
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
              <div
                key={log.id}
                className={`flex items-start space-x-3 p-2 rounded hover:bg-slate-50 ${
                  log.status === 'blocked' ? 'bg-red-50 border-l-4 border-red-500' : ''
                }`}
              >
                <span className="text-slate-500 w-16 flex-shrink-0">{log.time}</span>
                <div className="flex-shrink-0">
                  {log.status === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
                  {log.status === 'blocked' && <XCircle className="w-4 h-4 text-red-600" />}
                  {log.status === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600" />}
                </div>
                <span className="text-blue-600 w-48 flex-shrink-0">{log.agent}</span>
                <span className="flex-1">{log.action}</span>
                <Badge
                  variant="secondary"
                  className={`flex-shrink-0 ${
                    log.status === 'success'
                      ? 'bg-green-100 text-green-700'
                      : log.status === 'blocked'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {log.status.toUpperCase()}
                </Badge>
                {log.reason && <span className="text-slate-500 flex-shrink-0">• {log.reason}</span>}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
