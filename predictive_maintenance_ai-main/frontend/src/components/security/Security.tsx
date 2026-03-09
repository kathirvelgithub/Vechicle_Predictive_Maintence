import { useState } from 'react';
import { AgentBehaviorLog } from './AgentBehaviorLog';
import { AnomalyAlerts } from './AnomalyAlerts';
import { SecurityMetrics } from './SecurityMetrics';
import { CustomerInteractionModal } from './CustomerInteractionModal';
import { Button } from '../ui/button';
import { MessageSquare } from 'lucide-react';

export function Security() {
  const [showInteractionModal, setShowInteractionModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl mb-2">Security & UEBA Monitoring</h1>
          <p className="text-slate-600">User and Entity Behavior Analytics for AI Agent Orchestration</p>
        </div>
        <Button onClick={() => setShowInteractionModal(true)}>
          <MessageSquare className="w-4 h-4 mr-2" />
          View Customer Interaction Demo
        </Button>
      </div>

      {/* Security Metrics */}
      <SecurityMetrics />

      {/* Anomaly Detection Alerts */}
      <AnomalyAlerts />

      {/* Agent Behavior Log */}
      <AgentBehaviorLog />

      {/* Customer Interaction Modal */}
      {showInteractionModal && (
        <CustomerInteractionModal onClose={() => setShowInteractionModal(false)} />
      )}
    </div>
  );
}
