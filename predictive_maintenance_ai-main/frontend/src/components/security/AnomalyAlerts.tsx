import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { AlertTriangle, ShieldAlert, XCircle } from 'lucide-react';

const alerts = [
  {
    id: '1',
    timestamp: '2025-12-12 11:02:15 AM',
    severity: 'critical',
    agent: 'Scheduling Agent',
    action: 'Attempted unauthorized access to raw telematics stream API',
    blocked: true,
    reason: 'Agent permission scope limited to aggregated data only',
    response: 'Action blocked by UEBA Master Agent. Agent access revoked temporarily.',
  },
  {
    id: '2',
    timestamp: '2025-12-12 09:45:32 AM',
    severity: 'warning',
    agent: 'Customer Engagement Agent',
    action: 'Unusual call volume spike detected',
    blocked: false,
    reason: 'Call rate exceeded 150% of baseline without system notification',
    response: 'Monitored and logged. Pattern consistent with high-demand period.',
  },
  {
    id: '3',
    timestamp: '2025-12-12 08:12:08 AM',
    severity: 'critical',
    agent: 'Diagnosis Agent',
    action: 'Attempted database write operation',
    blocked: true,
    reason: 'Agent has read-only permissions. Write operation not authorized.',
    response: 'Operation blocked. Agent credentials reviewed and confirmed correct.',
  },
];

export function AnomalyAlerts() {
  return (
    <Card className="border-red-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <CardTitle>UEBA Anomaly Detection Alerts</CardTitle>
          </div>
          <Badge variant="destructive" className="animate-pulse">
            {alerts.filter((a) => a.severity === 'critical').length} Critical
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg p-4 border-2 ${
                alert.severity === 'critical'
                  ? 'bg-red-50 border-red-300'
                  : 'bg-amber-50 border-amber-300'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start space-x-3">
                  {alert.severity === 'critical' ? (
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <Badge
                        variant="secondary"
                        className={
                          alert.severity === 'critical'
                            ? 'bg-red-200 text-red-800'
                            : 'bg-amber-200 text-amber-800'
                        }
                      >
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-slate-600">{alert.timestamp}</span>
                      {alert.blocked && (
                        <Badge variant="secondary" className="bg-red-100 text-red-700">
                          <XCircle className="w-3 h-3 mr-1" />
                          BLOCKED
                        </Badge>
                      )}
                    </div>
                    <h3 className="mb-1">
                      <span className="text-blue-600">{alert.agent}</span> - Anomalous Behavior Detected
                    </h3>
                  </div>
                </div>
              </div>

              <div className="ml-8 space-y-2 text-sm">
                <div>
                  <span className="text-slate-600">Action Attempted:</span>
                  <p className="mt-1">{alert.action}</p>
                </div>
                <div>
                  <span className="text-slate-600">Detection Reason:</span>
                  <p className="mt-1">{alert.reason}</p>
                </div>
                <div className="bg-white rounded p-2 mt-2">
                  <span className="text-slate-600">UEBA Response:</span>
                  <p className="mt-1">{alert.response}</p>
                </div>
              </div>

              <div className="mt-4 ml-8 flex space-x-2">
                <Button size="sm" variant="outline">
                  View Full Log
                </Button>
                <Button size="sm" variant="outline">
                  Mark as Reviewed
                </Button>
                <Button size="sm" variant="outline">
                  Generate Incident Report
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
