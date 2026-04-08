import { useState } from 'react';
import { useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { MapPin } from 'lucide-react';
import { api, VehicleSummary } from '../../services/api';

const cityCoordinates: Record<string, { lat: number; lng: number }> = {
  mumbai: { lat: 19.076, lng: 72.877 },
  delhi: { lat: 28.704, lng: 77.102 },
  bangalore: { lat: 12.971, lng: 77.594 },
  chennai: { lat: 13.082, lng: 80.27 },
  hyderabad: { lat: 17.385, lng: 78.486 },
  pune: { lat: 18.52, lng: 73.856 },
};

export function FleetMap() {
  const [hoveredCluster, setHoveredCluster] = useState<number | null>(null);
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

  const vehicleClusters = useMemo(() => {
    const groups = new Map<string, VehicleSummary[]>();

    for (const vehicle of fleet) {
      const label = String(vehicle.location || 'Unknown').split(',')[0].trim() || 'Unknown';
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)?.push(vehicle);
    }

    return Array.from(groups.entries()).map(([city, vehicles], index) => {
      const key = city.toLowerCase();
      const coordinates = cityCoordinates[key] || { lat: 22.9734, lng: 78.6569 };
      return {
        id: index + 1,
        city,
        lat: coordinates.lat,
        lng: coordinates.lng,
        count: vehicles.length,
        healthy: vehicles.filter((vehicle) => vehicle.probability < 50).length,
        warning: vehicles.filter((vehicle) => vehicle.probability >= 50 && vehicle.probability < 80).length,
        critical: vehicles.filter((vehicle) => vehicle.probability >= 80).length,
      };
    });
  }, [fleet]);

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
