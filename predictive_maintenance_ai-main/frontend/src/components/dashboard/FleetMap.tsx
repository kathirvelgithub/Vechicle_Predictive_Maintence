import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { MapPin } from 'lucide-react';

const vehicleClusters = [
  { id: 1, city: 'Mumbai', lat: 19.076, lng: 72.877, count: 2845, healthy: 2620, warning: 180, critical: 45 },
  { id: 2, city: 'Delhi', lat: 28.704, lng: 77.102, count: 3120, healthy: 2890, warning: 195, critical: 35 },
  { id: 3, city: 'Bangalore', lat: 12.971, lng: 77.594, count: 2650, healthy: 2450, warning: 165, critical: 35 },
  { id: 4, city: 'Chennai', lat: 13.082, lng: 80.270, count: 1980, healthy: 1810, warning: 140, critical: 30 },
  { id: 5, city: 'Hyderabad', lat: 17.385, lng: 78.486, count: 1450, healthy: 1320, warning: 105, critical: 25 },
  { id: 6, city: 'Pune', lat: 18.520, lng: 73.856, count: 1230, healthy: 1140, warning: 75, critical: 15 },
];

export function FleetMap() {
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Fleet Map - India</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative bg-slate-100 rounded-lg h-96 overflow-hidden">
          {/* Simplified Map Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-slate-100">
            {/* Map Grid */}
            <svg className="w-full h-full opacity-20">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Vehicle Clusters */}
          {vehicleClusters.map((cluster) => (
            <div
              key={cluster.id}
              className="absolute cursor-pointer transition-transform hover:scale-110"
              style={{
                left: `${((cluster.lng - 68) / (97 - 68)) * 100}%`,
                top: `${100 - ((cluster.lat - 8) / (35 - 8)) * 100}%`,
              }}
              onMouseEnter={() => setHoveredCluster(cluster.id)}
              onMouseLeave={() => setHoveredCluster(null)}
            >
              {/* Pin */}
              <div className="relative">
                <div className="w-6 h-6 bg-blue-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                {/* Pulse Effect */}
                <div className="absolute inset-0 w-6 h-6 bg-blue-600 rounded-full animate-ping opacity-20" />
              </div>

              {/* Tooltip */}
              {hoveredCluster === cluster.id && (
                <div className="absolute left-8 top-0 bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-64 z-10">
                  <h4 className="mb-2">{cluster.city}</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Vehicles:</span>
                      <span>{cluster.count}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Healthy:</span>
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        {cluster.healthy}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Warning:</span>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        {cluster.warning}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Critical:</span>
                      <Badge variant="secondary" className="bg-red-100 text-red-700">
                        {cluster.critical}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 text-xs text-slate-500">
                    Click for detailed view
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-lg p-3 shadow-lg">
            <div className="text-xs mb-2">Health Status:</div>
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <span>Healthy</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-amber-500 rounded-full" />
                <span>Warning</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <span>Critical</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
