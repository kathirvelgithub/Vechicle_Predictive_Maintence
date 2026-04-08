import { useEffect, useMemo, useState } from 'react';
import { AgentBehaviorLog } from './AgentBehaviorLog';
import { AnomalyAlerts } from './AnomalyAlerts';
import { SecurityMetrics } from './SecurityMetrics';
import { CustomerInteractionModal, InteractionData } from './CustomerInteractionModal';
import { Button } from '../ui/button';
import { MessageSquare } from 'lucide-react';
import { api, VehicleSummary } from '../../services/api';

export function Security() {
  const [showInteractionModal, setShowInteractionModal] = useState(false);
  const [fleet, setFleet] = useState<VehicleSummary[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const rows = await api.getFleetStatus();
      if (mounted) {
        setFleet(rows);
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

  const interactionData = useMemo<InteractionData | null>(() => {
    const candidate = fleet.find((vehicle) =>
      Array.isArray(vehicle.voice_transcript) && vehicle.voice_transcript.length > 0,
    );

    if (!candidate || !candidate.voice_transcript?.length) {
      return null;
    }

    return {
      customerName: 'Customer',
      vin: candidate.vin,
      duration: `${candidate.voice_transcript.length} turns`,
      scheduledDate: candidate.scheduled_date
        ? new Date(candidate.scheduled_date).toLocaleString()
        : 'Not scheduled',
      transcript: candidate.voice_transcript.map((entry, index) => ({
        id: index + 1,
        speaker: String(entry.role || '').toLowerCase().includes('user') ? 'Customer' : 'AI Agent',
        text: entry.content,
        time: `${index + 1}`,
      })),
      audio_url: null,
      customerSentiment: candidate.probability > 80 ? 'Risk sensitive' : 'Neutral',
      channel: 'Voice Transcript',
      status: 'success',
    };
  }, [fleet]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div>
        <div>
            <h1 className="text-3xl font-bold text-slate-900">Security & UEBA Command Center</h1>
            <p className="mt-2 text-sm text-slate-600">Monitor AI behavior anomalies, triage incidents, and preserve audit evidence.</p>
        </div>
        </div>
      </div>

      <SecurityMetrics />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <AnomalyAlerts />
        </div>
        <div className="xl:col-span-4">
          <AgentBehaviorLog />
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setShowInteractionModal(true)}>
          <MessageSquare className="mr-2 h-4 w-4" />
          View Customer Interaction
        </Button>
      </div>

      {/* Customer Interaction Modal */}
      {showInteractionModal && (
        <CustomerInteractionModal
          onClose={() => setShowInteractionModal(false)}
          data={interactionData}
        />
      )}
    </div>
  );
}
