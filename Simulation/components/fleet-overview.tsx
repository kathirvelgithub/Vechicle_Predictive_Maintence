import { StatsCard } from './stats-card';
import {
  Truck,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';

interface FleetOverviewProps {
  totalVehicles: number;
  healthyVehicles: number;
  warningVehicles: number;
  criticalVehicles: number;
}

export function FleetOverview({
  totalVehicles,
  healthyVehicles,
  warningVehicles,
  criticalVehicles,
}: FleetOverviewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        title="Total Vehicles"
        value={totalVehicles}
        icon={<Truck />}
        variant="default"
      />
      <StatsCard
        title="Healthy"
        value={healthyVehicles}
        icon={<CheckCircle />}
        variant="healthy"
        change={
          totalVehicles > 0
            ? { value: Math.round((healthyVehicles / totalVehicles) * 100), direction: 'up' }
            : undefined
        }
      />
      <StatsCard
        title="Warning"
        value={warningVehicles}
        icon={<AlertTriangle />}
        variant="warning"
        change={
          totalVehicles > 0
            ? { value: Math.round((warningVehicles / totalVehicles) * 100), direction: 'up' }
            : undefined
        }
      />
      <StatsCard
        title="Critical"
        value={criticalVehicles}
        icon={<AlertCircle />}
        variant="critical"
        change={
          totalVehicles > 0
            ? { value: Math.round((criticalVehicles / totalVehicles) * 100), direction: 'down' }
            : undefined
        }
      />
    </div>
  );
}
