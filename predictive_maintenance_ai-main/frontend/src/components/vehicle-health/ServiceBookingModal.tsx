import { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Clock3, X } from 'lucide-react';

import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { useAuth } from '../../context/AuthContext';
import { api, SchedulingRecommendationResult } from '../../services/api';

interface ServiceBookingModalProps {
  vehicleId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const formatSlot = (value?: string): string => {
  if (!value) {
    return 'Unavailable';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

export function ServiceBookingModal({ vehicleId, onClose, onSuccess }: ServiceBookingModalProps) {
  const { user } = useAuth();

  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [recipient, setRecipient] = useState('maintenance.manager@fleet.local');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SchedulingRecommendationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recommendation = result?.recommendation;
  const canMakeDecision = recommendation?.status === 'recommended';

  const suggestedBy = useMemo(() => {
    return user?.email || 'vehicle-health-ui';
  }, [user?.email]);

  const createRecommendation = async () => {
    if (!date) {
      setErrorMessage('Please pick a date before requesting recommendation.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.createSchedulingRecommendation({
        vehicleId,
        serviceDate: date,
        notes,
        priority: 'high',
        suggestedBy,
        recipient,
      });
      setResult(response);
      onSuccess();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create recommendation');
    } finally {
      setLoading(false);
    }
  };

  const decideRecommendation = async (action: 'approve' | 'reject') => {
    if (!recommendation) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const response =
        action === 'approve'
          ? await api.approveRecommendation(recommendation.recommendation_id, user?.email, notes)
          : await api.rejectRecommendation(recommendation.recommendation_id, user?.email, notes);

      setResult(response);
      onSuccess();

      if (response.status === 'booked') {
        window.setTimeout(() => {
          onClose();
        }, 1600);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit decision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <Card className="w-[520px] shadow-2xl animate-in fade-in zoom-in duration-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Service Slot Recommendation</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">
            Preparing recommendation for <strong>{vehicleId}</strong>. This creates an approval alert before booking.
          </div>

          {!recommendation ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Service Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    type="date"
                    className="pl-9"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Approval Recipient</label>
                <Input
                  type="email"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="manager@company.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Maintenance Notes</label>
                <Input
                  placeholder="e.g. Check coolant system and oil pressure"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => void createRecommendation()}
                disabled={loading}
              >
                {loading ? 'Creating Recommendation...' : 'Send Approval Alert'}
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm font-semibold text-blue-900">Recommendation Created</p>
                <p className="mt-1 text-xs text-blue-800">
                  {recommendation.recommendation_id} for {recommendation.vehicle_id}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <p>
                  <span className="font-medium">Suggested slot:</span> {formatSlot(recommendation.recommended_start)}
                </p>
                <p>
                  <span className="font-medium">Duration:</span> {recommendation.estimated_duration_hours}h
                </p>
                <p>
                  <span className="font-medium">Priority:</span> {String(recommendation.priority || 'medium').toUpperCase()}
                </p>
                <p>
                  <span className="font-medium">Status:</span> {String(result?.status || recommendation.status).toUpperCase()}
                </p>
              </div>

              {result?.status === 'booked' ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4" />
                    Booking Confirmed
                  </div>
                  <p className="mt-1 text-xs">Booking ID: {result.booking_id}</p>
                </div>
              ) : result?.status === 'conflict' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Slot conflict detected
                  </div>
                  {result.alternative_start && (
                    <p className="mt-1 text-xs">Alternative: {formatSlot(result.alternative_start)}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3 className="h-4 w-4" />
                    Alert sent. Waiting for approval.
                  </div>
                  <p className="mt-1 text-xs">Approvers can act from the Scheduling Approval Inbox.</p>
                </div>
              )}

              {canMakeDecision ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    disabled={loading}
                    onClick={() => void decideRecommendation('approve')}
                  >
                    Approve Now (Demo)
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                    disabled={loading}
                    onClick={() => void decideRecommendation('reject')}
                  >
                    Reject
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {errorMessage}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
