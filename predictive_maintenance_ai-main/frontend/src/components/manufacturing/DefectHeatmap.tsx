import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { AlertTriangle } from 'lucide-react';

const defectZones = [
  { id: 'engine', x: 35, y: 30, severity: 'high', count: 45, label: 'Engine Bay', description: 'Vibration sensor anomalies' },
  { id: 'transmission', x: 45, y: 50, severity: 'critical', count: 78, label: 'Transmission', description: 'Clutch plate wear' },
  { id: 'suspension-fl', x: 25, y: 70, severity: 'medium', count: 23, label: 'Front Left Suspension', description: 'Bushing degradation' },
  { id: 'suspension-fr', x: 55, y: 70, severity: 'medium', count: 21, label: 'Front Right Suspension', description: 'Bushing degradation' },
  { id: 'battery', x: 20, y: 35, severity: 'high', count: 52, label: 'Battery', description: 'Voltage fluctuations' },
  { id: 'coolant', x: 40, y: 25, severity: 'medium', count: 34, label: 'Coolant System', description: 'Temperature spikes' },
  { id: 'brakes-front', x: 40, y: 75, severity: 'low', count: 15, label: 'Front Brakes', description: 'Pad wear' },
  { id: 'fuel-pump', x: 50, y: 55, severity: 'high', count: 67, label: 'Fuel Pump', description: 'Premature wear (Tier-2 cities)' },
];

export function DefectHeatmap() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Vehicle Defect Heatmap - Field Data Analysis</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Recurring defects mapped to vehicle chassis (Q3 2023 Production - Batch #445)
            </p>
          </div>
          <Badge variant="secondary" className="bg-purple-100 text-purple-700">
            Last Updated: Dec 12, 2025
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vehicle Diagram */}
          <div className="lg:col-span-2">
            <div className="relative bg-slate-100 rounded-lg p-8" style={{ aspectRatio: '16/9' }}>
              {/* Simplified top-down vehicle outline */}
              <svg viewBox="0 0 400 250" className="w-full h-full">
                {/* Vehicle Body */}
                <path
                  d="M 100 50 L 300 50 L 320 80 L 320 170 L 300 200 L 100 200 L 80 170 L 80 80 Z"
                  fill="white"
                  stroke="#64748b"
                  strokeWidth="2"
                />
                {/* Windshield */}
                <path d="M 120 50 L 280 50 L 260 80 L 140 80 Z" fill="#e2e8f0" stroke="#64748b" strokeWidth="1" />
                {/* Front Wheels */}
                <ellipse cx="120" cy="80" rx="15" ry="25" fill="#475569" />
                <ellipse cx="280" cy="80" rx="15" ry="25" fill="#475569" />
                {/* Rear Wheels */}
                <ellipse cx="120" cy="170" rx="15" ry="25" fill="#475569" />
                <ellipse cx="280" cy="170" rx="15" ry="25" fill="#475569" />
                {/* Engine Hood */}
                <rect x="120" y="70" width="160" height="40" fill="#f1f5f9" stroke="#64748b" strokeWidth="1" />
                <text x="200" y="95" textAnchor="middle" className="text-xs" fill="#64748b">Engine</text>
                {/* Cabin */}
                <rect x="120" y="120" width="160" height="60" fill="#f8fafc" stroke="#64748b" strokeWidth="1" />
              </svg>

              {/* Defect Markers */}
              {defectZones.map((zone) => (
                <div
                  key={zone.id}
                  className="absolute group cursor-pointer"
                  style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                >
                  {/* Marker */}
                  <div
                    className={`w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse ${
                      zone.severity === 'critical'
                        ? 'bg-red-500'
                        : zone.severity === 'high'
                        ? 'bg-orange-500'
                        : zone.severity === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-yellow-500'
                    }`}
                  >
                    <AlertTriangle className="w-3 h-3 text-white" />
                  </div>
                  {/* Pulse Effect */}
                  <div
                    className={`absolute inset-0 w-6 h-6 rounded-full animate-ping opacity-30 ${
                      zone.severity === 'critical'
                        ? 'bg-red-500'
                        : zone.severity === 'high'
                        ? 'bg-orange-500'
                        : zone.severity === 'medium'
                        ? 'bg-amber-500'
                        : 'bg-yellow-500'
                    }`}
                  />
                  {/* Tooltip */}
                  <div className="absolute left-8 top-0 bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-56 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <h4 className="text-sm mb-1">{zone.label}</h4>
                    <p className="text-xs text-slate-600 mb-2">{zone.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Occurrences:</span>
                      <Badge
                        variant="secondary"
                        className={
                          zone.severity === 'critical'
                            ? 'bg-red-100 text-red-700'
                            : zone.severity === 'high'
                            ? 'bg-orange-100 text-orange-700'
                            : zone.severity === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }
                      >
                        {zone.count}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend & Stats */}
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="mb-3">Severity Legend</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-red-500 rounded-full" />
                    <span>Critical</span>
                  </div>
                  <span className="text-slate-600">50+ cases</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-orange-500 rounded-full" />
                    <span>High</span>
                  </div>
                  <span className="text-slate-600">30-50 cases</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-amber-500 rounded-full" />
                    <span>Medium</span>
                  </div>
                  <span className="text-slate-600">15-30 cases</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-yellow-500 rounded-full" />
                    <span>Low</span>
                  </div>
                  <span className="text-slate-600">&lt;15 cases</span>
                </div>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 mb-2">Critical Issues</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-red-700">Transmission (78 cases)</p>
                  <p className="text-xs text-red-600">Batch #445 correlation</p>
                </div>
                <div>
                  <p className="text-orange-700">Fuel Pump (67 cases)</p>
                  <p className="text-xs text-orange-600">Tier-2 city specific</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-blue-800 mb-2">Total Defects Analyzed</h3>
              <p className="text-3xl text-blue-600">
                {defectZones.reduce((acc, zone) => acc + zone.count, 0)}
              </p>
              <p className="text-xs text-blue-600 mt-1">Across 2,850 vehicles</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
