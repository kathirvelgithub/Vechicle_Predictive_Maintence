import { AgentStatusWidget } from './AgentStatusWidget';
import { MetricsCards } from './MetricsCards';
import { FleetMap } from './FleetMap';
import { ActivityFeed } from './ActivityFeed';


export function MasterDashboard() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2">Master Agent Dashboard</h1>
        <p className="text-slate-600">AI Orchestration Command Center</p>
      </div>

      {/* Agent Status Widget */}
      <AgentStatusWidget />

      {/* Key Metrics */}
      <MetricsCards />

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FleetMap />
        <ActivityFeed />
      </div>
    </div>
  );
}
