import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import {
  api,
  SchedulingRecommendation,
  SchedulingRecommendationResult,
} from '../../services/api';
import { stream } from '../../services/stream';

interface SchedulingApprovalInboxProps {
  defaultApprover?: string;
  onDecisionComplete?: () => void;
}

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-800 border-rose-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const STATUS_CLASS: Record<string, string> = {
  recommended: 'bg-slate-100 text-slate-800 border-slate-200',
  booked: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  pending_customer_confirmation: 'bg-blue-100 text-blue-800 border-blue-200',
  customer_declined: 'bg-rose-100 text-rose-800 border-rose-200',
  conflict: 'bg-amber-100 text-amber-800 border-amber-200',
  rejected: 'bg-zinc-100 text-zinc-700 border-zinc-200',
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return 'Unavailable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const toPriorityClass = (priority?: string): string => {
  const normalized = String(priority || 'medium').toLowerCase();
  return PRIORITY_CLASS[normalized] || PRIORITY_CLASS.medium;
};

const formatConfirmationChannel = (method?: string): string => {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === 'email') {
    return 'email';
  }
  if (normalized === 'sms') {
    return 'SMS';
  }
  return 'customer';
};

export function SchedulingApprovalInbox({
  defaultApprover,
  onDecisionComplete,
}: SchedulingApprovalInboxProps) {
  const [approverEmail, setApproverEmail] = useState(defaultApprover || '');
  const [recommendations, setRecommendations] = useState<SchedulingRecommendation[]>([]);
  const [notesByRecommendation, setNotesByRecommendation] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const hasRecommendations = recommendations.length > 0;

  const loadPendingRecommendations = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const rows = await api.getPendingRecommendations();
      setRecommendations(rows);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load pending recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setApproverEmail((previous) => previous || defaultApprover || '');
  }, [defaultApprover]);

  useEffect(() => {
    void loadPendingRecommendations();
  }, [loadPendingRecommendations]);

  useEffect(() => {
    stream.start();
    const unsubscribe = stream.subscribe((event) => {
      if (!event.topic.startsWith('scheduling.recommendation.') && event.topic !== 'notification.created') {
        return;
      }
      void loadPendingRecommendations();
    });

    return () => {
      unsubscribe();
    };
  }, [loadPendingRecommendations]);

  const executeDecision = useCallback(
    async (
      recommendationId: string,
      action: 'approve' | 'reject',
    ) => {
      setProcessingId(recommendationId);
      setErrorMessage(null);
      setStatusMessage(null);

      try {
        const note = notesByRecommendation[recommendationId] || '';
        let result: SchedulingRecommendationResult;

        if (action === 'approve') {
          result = await api.approveRecommendation(recommendationId, approverEmail || undefined, note);
        } else {
          result = await api.rejectRecommendation(recommendationId, approverEmail || undefined, note);
        }

        if (result.status === 'booked') {
          setStatusMessage(`Approved ${recommendationId}. Booking ${result.booking_id} confirmed.`);
        } else if (result.status === 'pending_customer_confirmation') {
          const confirmationChannel = formatConfirmationChannel(
            result.recommendation?.customer_confirmation_method ||
            (result.email_confirmation ? 'email' : result.sms_confirmation ? 'sms' : undefined),
          );
          setStatusMessage(
            `Approved ${recommendationId}. Waiting for customer ${confirmationChannel} confirmation before booking.`,
          );
        } else if (result.status === 'conflict') {
          const alternative = result.alternative_start ? ` Alternative: ${formatDateTime(result.alternative_start)}.` : '';
          setStatusMessage(`Conflict detected for ${recommendationId}.${alternative}`);
        } else {
          setStatusMessage(`${recommendationId} moved to status: ${result.status}.`);
        }

        await loadPendingRecommendations();
        onDecisionComplete?.();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Decision failed');
      } finally {
        setProcessingId(null);
      }
    },
    [approverEmail, loadPendingRecommendations, notesByRecommendation, onDecisionComplete],
  );

  const recommendationRows = useMemo(() => {
    return recommendations.map((recommendation) => {
      const recommendationId = recommendation.recommendation_id;
      const recommendationNote = notesByRecommendation[recommendationId] || '';
      const isProcessing = processingId === recommendationId;
      const currentStatus = String(recommendation.status || '').trim().toLowerCase();
      const isAwaitingCustomer = currentStatus === 'pending_customer_confirmation';
      const confirmationChannel = formatConfirmationChannel(recommendation.customer_confirmation_method);
      const confirmationTarget = recommendation.customer_confirmation_email || recommendation.customer_confirmation_phone;
      return (
        <div
          key={recommendationId}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{recommendation.vehicle_id}</p>
              <p className="text-xs text-slate-500">Recommendation ID: {recommendationId}</p>
            </div>
            <Badge variant="outline" className={toPriorityClass(recommendation.priority)}>
              {String(recommendation.priority || 'medium').toUpperCase()}
            </Badge>
            <Badge variant="outline" className={STATUS_CLASS[currentStatus] || STATUS_CLASS.recommended}>
              {String(recommendation.status || 'recommended').replace(/_/g, ' ').toUpperCase()}
            </Badge>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
            <p>
              <span className="font-medium">Suggested slot:</span> {formatDateTime(recommendation.recommended_start)}
            </p>
            <p>
              <span className="font-medium">Duration:</span> {recommendation.estimated_duration_hours}h
            </p>
            <p>
              <span className="font-medium">Service:</span> {recommendation.service_type || 'repair'}
            </p>
            <p>
              <span className="font-medium">Alert recipient:</span> {recommendation.recipient || 'Unassigned'}
            </p>
            {isAwaitingCustomer ? (
              <p>
                <span className="font-medium">Customer channel:</span> {confirmationChannel}
                {confirmationTarget ? ` (${confirmationTarget})` : ''}
              </p>
            ) : null}
          </div>

          <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            {recommendation.reason || 'No reason provided'}
          </div>

          <div className="mt-3 space-y-2">
            <Input
              placeholder="Decision note (optional)"
              value={recommendationNote}
              onChange={(event) =>
                setNotesByRecommendation((previous) => ({
                  ...previous,
                  [recommendationId]: event.target.value,
                }))
              }
            />
            <div className="flex flex-wrap gap-2">
              {!isAwaitingCustomer ? (
                <>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={isProcessing}
                    onClick={() => void executeDecision(recommendationId, 'approve')}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve and Book
                  </Button>
                  <Button
                    variant="outline"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    disabled={isProcessing}
                    onClick={() => void executeDecision(recommendationId, 'reject')}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </>
              ) : (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  Customer {confirmationChannel} confirmation is pending for this recommendation.
                </div>
              )}
            </div>
          </div>
        </div>
      );
    });
  }, [executeDecision, notesByRecommendation, processingId, recommendations]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-blue-600" />
              Approval Inbox
            </CardTitle>
            <p className="mt-1 text-sm text-slate-600">
              Review alerts and approve recommended slots before booking is finalized.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadPendingRecommendations()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[240px_1fr] md:items-center">
          <label className="text-sm font-medium text-slate-700">Approver identity</label>
          <Input
            value={approverEmail}
            onChange={(event) => setApproverEmail(event.target.value)}
            placeholder="approver@company.com"
          />
        </div>

        {statusMessage && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading pending recommendations...
          </div>
        ) : null}

        {!loading && !hasRecommendations ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            No pending recommendations right now.
          </div>
        ) : null}

        {!loading && hasRecommendations ? (
          <div className="space-y-3">{recommendationRows}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
