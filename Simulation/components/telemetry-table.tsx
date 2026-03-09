'use client';

import { TelemetryData } from '@/lib/telemetry-generator';
import { getVehicleHealth } from '@/lib/telemetry-generator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TelemetryTableProps {
  data: TelemetryData[];
}

export function TelemetryTable({ data }: TelemetryTableProps) {
  const getStatusColor = (health: string) => {
    switch (health) {
      case 'critical':
        return 'bg-status-critical/10 text-status-critical border-l-4 border-status-critical';
      case 'warning':
        return 'bg-status-warning/10 text-status-warning border-l-4 border-status-warning';
      case 'healthy':
        return 'bg-status-healthy/10 text-status-healthy border-l-4 border-status-healthy';
      default:
        return '';
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const healthOrder = { critical: 0, warning: 1, healthy: 2 };
    const aHealth = getVehicleHealth(a.engineTemperature);
    const bHealth = getVehicleHealth(b.engineTemperature);
    return healthOrder[aHealth as keyof typeof healthOrder] - 
           healthOrder[bHealth as keyof typeof healthOrder];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Vehicle Telemetry</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Vehicle ID</TableHead>
                <TableHead>Engine Temp</TableHead>
                <TableHead>RPM</TableHead>
                <TableHead>Speed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.slice(0, 15).map((vehicle) => {
                const health = getVehicleHealth(vehicle.engineTemperature);
                const timeAgo = Math.round(
                  (Date.now() - new Date(vehicle.timestamp).getTime()) / 1000
                );

                return (
                  <TableRow
                    key={vehicle.vehicleId}
                    className={`${getStatusColor(health)}`}
                  >
                    <TableCell className="font-mono font-semibold">
                      {vehicle.vehicleId}
                    </TableCell>
                    <TableCell>
                      {vehicle.engineTemperature.toFixed(1)}°C
                    </TableCell>
                    <TableCell>
                      {Math.round(vehicle.rpm).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {vehicle.speed.toFixed(1)} km/h
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-current/20">
                        {health.charAt(0).toUpperCase() + health.slice(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {timeAgo}s ago
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Showing {Math.min(15, sortedData.length)} of {sortedData.length} vehicles
        </p>
      </CardContent>
    </Card>
  );
}
