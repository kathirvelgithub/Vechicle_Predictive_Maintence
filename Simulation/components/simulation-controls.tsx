'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Square, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SimulationControlsProps {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  vehicleCount: number;
  onVehicleCountChange: (count: number) => void;
  interval: number;
  onIntervalChange: (interval: number) => void;
  apiUrl: string;
  onApiUrlChange: (url: string) => void;
}

export function SimulationControls({
  isRunning,
  onStart,
  onStop,
  vehicleCount,
  onVehicleCountChange,
  interval,
  onIntervalChange,
  apiUrl,
  onApiUrlChange,
}: SimulationControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localVehicleCount, setLocalVehicleCount] = useState(vehicleCount);
  const [localInterval, setLocalInterval] = useState(interval);
  const [localApiUrl, setLocalApiUrl] = useState(apiUrl);

  useEffect(() => {
    setLocalVehicleCount(vehicleCount);
  }, [vehicleCount]);

  useEffect(() => {
    setLocalInterval(interval);
  }, [interval]);

  useEffect(() => {
    setLocalApiUrl(apiUrl);
  }, [apiUrl]);

  const handleVehicleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setLocalVehicleCount(value);
    onVehicleCountChange(value);
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setLocalInterval(value);
    onIntervalChange(value);
  };

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalApiUrl(value);
    onApiUrlChange(value);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Simulation Controls</CardTitle>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="p-2 hover:bg-secondary/50 rounded transition-colors"
          title="Advanced settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Controls */}
        <div className="flex gap-2">
          {!isRunning ? (
            <Button
              onClick={onStart}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Simulation
            </Button>
          ) : (
            <Button
              onClick={onStop}
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              size="lg"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Simulation
            </Button>
          )}
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 p-3 rounded bg-secondary/50">
          <div
            className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-status-healthy animate-pulse' : 'bg-status-warning'
            }`}
          />
          <span className="text-sm text-foreground">
            {isRunning ? 'Simulation running...' : 'Simulation stopped'}
          </span>
        </div>

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="space-y-4 pt-4 border-t border-border">
            {/* Vehicle Count */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Number of Vehicles: <span className="text-primary">{localVehicleCount}</span>
              </label>
              <input
                type="range"
                min="1"
                max="500"
                value={localVehicleCount}
                onChange={handleVehicleCountChange}
                disabled={isRunning}
                className="w-full h-2 bg-secondary rounded appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Min: 1 | Max: 500
              </p>
            </div>

            {/* Interval */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Update Interval: <span className="text-primary">{localInterval}ms</span>
              </label>
              <input
                type="range"
                min="500"
                max="10000"
                step="500"
                value={localInterval}
                onChange={handleIntervalChange}
                disabled={isRunning}
                className="w-full h-2 bg-secondary rounded appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Min: 500ms | Max: 10000ms
              </p>
            </div>

            {/* API URL */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                API Endpoint
              </label>
              <input
                type="text"
                value={localApiUrl}
                onChange={handleApiUrlChange}
                disabled={isRunning}
                placeholder="/api/telematics"
                className="w-full px-3 py-2 bg-secondary text-foreground rounded border border-border text-sm disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Configure the API endpoint for telemetry data
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
