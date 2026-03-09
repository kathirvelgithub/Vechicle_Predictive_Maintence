'use client';

import { TelemetryData, getVehicleHealth } from '@/lib/telemetry-generator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEffect, useRef } from 'react';

interface FleetMapProps {
  data: TelemetryData[];
}

export function FleetMap({ data }: FleetMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#2a2a33';
    ctx.lineWidth = 1;
    const gridSpacing = 40;
    
    for (let i = 0; i < width; i += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
      ctx.stroke();
    }
    
    for (let i = 0; i < height; i += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(width, i);
      ctx.stroke();
    }

    // Fleet center coordinates for mapping
    const fleetCenterLat = 37.7749;
    const fleetCenterLng = -122.4194;
    const fleetRadius = 0.1;

    // Convert lat/lng to canvas coordinates
    const latToY = (lat: number) => {
      const normalized = (fleetCenterLat - lat) / (fleetRadius * 2);
      return (0.5 + normalized * 0.5) * height;
    };

    const lngToX = (lng: number) => {
      const normalized = (lng - fleetCenterLng) / (fleetRadius * 2);
      return (0.5 + normalized * 0.5) * width;
    };

    // Draw vehicles
    data.forEach((vehicle) => {
      const x = lngToX(vehicle.longitude);
      const y = latToY(vehicle.latitude);

      // Only draw if within canvas bounds
      if (x > 0 && x < width && y > 0 && y < height) {
        const health = getVehicleHealth(vehicle.engineTemperature);

        // Determine color based on health
        let color = '#10b981'; // healthy
        if (health === 'warning') color = '#f59e0b';
        if (health === 'critical') color = '#ef4444';

        // Draw vehicle marker
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Draw outer ring for active vehicles
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    // Draw legend
    const legendX = 10;
    const legendY = 10;
    const legendSpacing = 20;

    ctx.font = '12px Geist, sans-serif';
    ctx.fillStyle = '#8b8b99';
    ctx.fillText('Legend:', legendX, legendY);

    // Healthy
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(legendX + 5, legendY + 15, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e8ec';
    ctx.fillText('Healthy', legendX + 15, legendY + 19);

    // Warning
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(legendX + 5, legendY + 35, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e8ec';
    ctx.fillText('Warning', legendX + 15, legendY + 39);

    // Critical
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(legendX + 5, legendY + 55, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e8ec';
    ctx.fillText('Critical', legendX + 15, legendY + 59);

    // Show vehicle count
    ctx.font = 'bold 14px Geist, sans-serif';
    ctx.fillStyle = '#e8e8ec';
    ctx.textAlign = 'right';
    ctx.fillText(`Active: ${data.length} vehicles`, width - 10, 25);
    ctx.textAlign = 'left';
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Location Map</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full h-96 bg-background rounded border border-border overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Real-time vehicle positions in fleet area (San Francisco region)
        </p>
      </CardContent>
    </Card>
  );
}
