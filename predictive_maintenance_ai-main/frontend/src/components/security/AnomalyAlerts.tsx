import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { AlertTriangle, ShieldAlert, XCircle, Clock3, CheckCircle2 } from 'lucide-react';
import { api, NotificationItem } from '../../services/api';
import { stream } from '../../services/stream';

interface AlertViewModel {
  id: string;
  notificationId?: string;
  vehicleId: string;
  timestamp: string;
  severity: 'critical' | 'warning';
  agent: string;
  action: string;
  blocked: boolean;
  reason: string;
  response: string;
}

interface IncidentSummary {
  generatedAt: string;
  vehicleId: string;
  riskScore?: number;
  riskLevel?: string;
  diagnosis?: string;
  rootCause: string;
  proposedScheduleDate: string;
  alertContext: string;
}

const formatTimestamp = (value?: string): string => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return value || 'Unknown time';
  }
  return parsed.toLocaleString();
};

const formatDateOnly = (value?: string): string => {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString();
};

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const inferRootCause = (alertReason: string, diagnosis?: string, telematics?: { engine_temp_c?: number; oil_pressure_psi?: number; battery_voltage?: number; rpm?: number; coolant_temp_c?: number }): string => {
  const reason = alertReason.toLowerCase();
  const diag = (diagnosis || '').toLowerCase();

  if (reason.includes('oil') || diag.includes('oil') || (telematics?.oil_pressure_psi ?? 99) < 22) {
    return 'Oil pressure trend indicates potential lubrication risk. Immediate inspection is recommended to avoid engine wear.';
  }
  if (reason.includes('temperature') || reason.includes('overheat') || diag.includes('temperature') || (telematics?.engine_temp_c ?? 0) > 106 || (telematics?.coolant_temp_c ?? 0) > 98) {
    return 'Temperature profile suggests overheating risk, likely linked to cooling system efficiency. Cooling loop checks should be prioritized.';
  }
  if (reason.includes('battery') || diag.includes('battery') || (telematics?.battery_voltage ?? 99) < 12.1) {
    return 'Battery voltage drift indicates electrical instability that can impact start reliability and onboard electronics.';
  }
  if (reason.includes('rpm') || diag.includes('rpm') || (telematics?.rpm ?? 0) > 3200) {
    return 'Sustained high RPM pattern may indicate drivetrain strain under operating conditions; preventative service is advised.';
  }

  return 'Combined UEBA and telematics signals show an anomalous operating pattern requiring preventative inspection.';
};

const computeProposedDate = (riskScore?: number, explicitDate?: string): string => {
  if (explicitDate) {
    return formatDateOnly(explicitDate);
  }

  const score = Number.isFinite(Number(riskScore)) ? Number(riskScore) : 50;
  const now = new Date();
  const daysToAdd = score >= 85 ? 1 : score >= 70 ? 3 : score >= 50 ? 7 : 14;
  now.setDate(now.getDate() + daysToAdd);
  return now.toLocaleDateString();
};

export function AnomalyAlerts() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [reviewedLocalIds, setReviewedLocalIds] = useState<string[]>([]);
  const [processingReviewId, setProcessingReviewId] = useState<string | null>(null);
  const [summaryLoadingId, setSummaryLoadingId] = useState<string | null>(null);
  const [incidentSummary, setIncidentSummary] = useState<IncidentSummary | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const [pendingScrollAlertId, setPendingScrollAlertId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const rows = await api.getNotifications({ limit: 30 });
      if (mounted) {
        setNotifications(rows);
      }
    };

    void load();
    stream.start();
    const unsubscribe = stream.subscribe((event) => {
      if (event.topic === 'notification.created' || event.topic === 'anomaly.event') {
        void load();
      }
    });

    const timer = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      unsubscribe();
    };
  }, []);

  const alerts = useMemo<AlertViewModel[]>(() => {
    return notifications
      .filter((item) => {
        const type = String(item.notification_type || '').toLowerCase();
        return type === 'critical' || type === 'alert' || type === 'approval_required';
      })
      .slice(0, 10)
      .map((item) => {
        const type = String(item.notification_type || '').toLowerCase();
        const severity = type === 'critical' ? 'critical' : 'warning';
        return {
          id: item.id || `${item.vehicle_id}-${item.sent_at}`,
          notificationId: item.id,
          vehicleId: item.vehicle_id,
          timestamp: formatTimestamp(item.sent_at),
          severity,
          agent: 'UEBA Monitor',
          action: item.title || 'Alert raised',
          blocked: severity === 'critical',
          reason: item.message || 'No additional context provided',
          response: item.acknowledged
            ? 'Alert acknowledged by operator.'
            : 'Alert is active and waiting for review.',
        };
      });
  }, [notifications]);

  useEffect(() => {
    if (!alerts.length) {
      setSelectedAlertId(null);
      return;
    }

    if (!selectedAlertId || !alerts.some((alert) => alert.id === selectedAlertId)) {
      setSelectedAlertId(alerts[0].id);
    }
  }, [alerts, selectedAlertId]);

  useEffect(() => {
    if (!pendingScrollAlertId || pendingScrollAlertId !== selectedAlertId) {
      return;
    }

    const panel = detailPanelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const isOutOfView = rect.top < 80 || rect.bottom > viewportHeight - 24;

    if (isOutOfView) {
      panel.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }

    setPendingScrollAlertId(null);
  }, [pendingScrollAlertId, selectedAlertId]);

  const selectedAlert = alerts.find((alert) => alert.id === selectedAlertId) || null;
  const reviewedSet = new Set(reviewedLocalIds);

  const handleSelectAlert = (alertId: string) => {
    setSelectedAlertId(alertId);
    setPendingScrollAlertId(alertId);
  };

  const markReviewed = async (alert: AlertViewModel) => {
    if (processingReviewId) {
      return;
    }

    setProcessingReviewId(alert.id);
    try {
      if (alert.notificationId) {
        await api.markNotificationRead(alert.notificationId);
      }

      setReviewedLocalIds((previous) => (previous.includes(alert.id) ? previous : [...previous, alert.id]));
    } catch {
      // Keep UI responsive even when backend endpoint is temporarily unavailable.
      setReviewedLocalIds((previous) => (previous.includes(alert.id) ? previous : [...previous, alert.id]));
    } finally {
      setProcessingReviewId(null);
    }
  };

  const handleViewFullLog = () => {
    if (!selectedAlert) {
      return;
    }

    const generateSummary = async () => {
      setSummaryLoadingId(selectedAlert.id);
      try {
        const telematics = await api.getTelematics(selectedAlert.vehicleId);
        const prediction = await api.runPrediction(selectedAlert.vehicleId, telematics || undefined);

        const rootCause = inferRootCause(selectedAlert.reason, prediction?.diagnosis, telematics || undefined);
        const proposedScheduleDate = computeProposedDate(prediction?.risk_score, prediction?.scheduled_date);

        setIncidentSummary({
          generatedAt: new Date().toLocaleString(),
          vehicleId: selectedAlert.vehicleId,
          riskScore: prediction?.risk_score,
          riskLevel: prediction?.risk_level,
          diagnosis: prediction?.diagnosis,
          rootCause,
          proposedScheduleDate,
          alertContext: selectedAlert.reason,
        });
      } finally {
        setSummaryLoadingId(null);
      }
    };

    void generateSummary();
  };

  const handleGenerateIncidentReport = (alert: AlertViewModel) => {
    const generatedAt = new Date().toISOString();
    const report = [
      '# UEBA Incident Report',
      `Generated: ${generatedAt}`,
      `Incident ID: ${alert.id}`,
      `Notification ID: ${alert.notificationId || 'N/A'}`,
      `Vehicle: ${alert.vehicleId || 'N/A'}`,
      `Severity: ${alert.severity.toUpperCase()}`,
      `Agent: ${alert.agent}`,
      `Timestamp: ${alert.timestamp}`,
      '',
      '## Action Attempted',
      alert.action,
      '',
      '## Detection Reason',
      alert.reason,
      '',
      '## UEBA Response',
      alert.response,
      incidentSummary && incidentSummary.vehicleId === alert.vehicleId ? '' : '',
      incidentSummary && incidentSummary.vehicleId === alert.vehicleId ? '## AI Incident Summary' : '',
      incidentSummary && incidentSummary.vehicleId === alert.vehicleId ? `Root Cause: ${incidentSummary.rootCause}` : '',
      incidentSummary && incidentSummary.vehicleId === alert.vehicleId ? `Proposed Schedule Date: ${incidentSummary.proposedScheduleDate}` : '',
    ].join('\n');

    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ueba-incident-${alert.vehicleId || 'unknown'}-${Date.now()}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-red-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <CardTitle>UEBA Anomaly Detection Alerts</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="animate-pulse">
              {alerts.filter((a) => a.severity === 'critical').length} Critical
            </Badge>
            <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
              {alerts.length} Open Alerts
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No UEBA anomalies detected from live notifications.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-5">
              {alerts.map((alert) => {
                const isSelected = alert.id === selectedAlertId;
                const isReviewed = reviewedSet.has(alert.id);
                return (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => handleSelectAlert(alert.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? alert.severity === 'critical'
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-amber-300 bg-amber-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${alert.severity === 'critical' ? 'text-rose-600' : 'text-amber-600'}`} />
                        <p className="text-sm font-semibold text-slate-900">{alert.action}</p>
                      </div>
                      <Badge variant="outline" className={alert.severity === 'critical' ? 'border-rose-300 bg-rose-100 text-rose-900' : 'border-amber-300 bg-amber-100 text-amber-900'}>
                        {alert.severity.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {alert.timestamp}</span>
                      <span>{isReviewed ? 'Reviewed' : 'Open'}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7" ref={detailPanelRef}>
              {selectedAlert && (
                <div className={`rounded-lg border p-4 ${selectedAlert.severity === 'critical' ? 'border-rose-300 bg-rose-50/60' : 'border-amber-300 bg-amber-50/60'}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{selectedAlert.agent}</h3>
                      {selectedAlert.blocked && (
                        <Badge variant="secondary" className="bg-rose-100 text-rose-800">
                          <XCircle className="mr-1 h-3 w-3" /> BLOCKED
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">{selectedAlert.timestamp}</Badge>
                  </div>

                  <div className="space-y-3 text-sm text-slate-800">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Action Attempted</p>
                      <p className="mt-1">{selectedAlert.action}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Detection Reason</p>
                      <p className="mt-1 leading-relaxed">{selectedAlert.reason}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">UEBA Response</p>
                      <p className="mt-1">{selectedAlert.response}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleViewFullLog}
                      disabled={summaryLoadingId === selectedAlert.id}
                    >
                      {summaryLoadingId === selectedAlert.id ? 'Generating AI Summary...' : 'View Full Log'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                      onClick={() => void markReviewed(selectedAlert)}
                      disabled={processingReviewId === selectedAlert.id}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> {processingReviewId === selectedAlert.id ? 'Marking...' : 'Mark as Reviewed'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleGenerateIncidentReport(selectedAlert)}>Generate Incident Report</Button>
                  </div>

                  {incidentSummary && incidentSummary.vehicleId === selectedAlert.vehicleId && (
                    <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-slate-800">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">AI Full Incident Summary</p>
                        <span className="text-xs text-slate-600">Generated: {incidentSummary.generatedAt}</span>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <p>
                          <span className="font-semibold text-slate-700">Vehicle:</span> {incidentSummary.vehicleId}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-700">Risk:</span>{' '}
                          {toNumber(incidentSummary.riskScore) !== null ? `${incidentSummary.riskScore} (${incidentSummary.riskLevel || 'UNKNOWN'})` : 'Not available'}
                        </p>
                      </div>
                      <p className="mt-2">
                        <span className="font-semibold text-slate-700">Why This Alert Was Created:</span> {incidentSummary.rootCause}
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold text-slate-700">Telematics + Diagnosis Summary:</span>{' '}
                        {incidentSummary.diagnosis || incidentSummary.alertContext}
                      </p>
                      <p className="mt-2">
                        <span className="font-semibold text-slate-700">Proposed Schedule Date:</span> {incidentSummary.proposedScheduleDate}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
