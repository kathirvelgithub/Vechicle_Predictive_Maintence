import { useState } from 'react';
import { VehicleTable } from './VehicleTable';
import { VehicleDetailPanel } from './VehicleDetailPanel';
import { VehicleDetailErrorBoundary } from './VehicleDetailErrorBoundary';

export function VehicleHealth() {
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2 font-bold text-slate-900">Vehicle Health & Predictive Maintenance</h1>
        <p className="text-slate-600">Real-time diagnostics and failure predictions powered by AI</p>
      </div>

      {/* Vehicle Data Grid */}
      <VehicleTable 
        onSelectVehicle={setSelectedVehicle} 
        selectedVehicle={selectedVehicle} 
      />

      {/* Vehicle Detail Slide-out Panel */}
      {selectedVehicle && (
        <VehicleDetailErrorBoundary
          key={`detail-boundary-${selectedVehicle}`}
          vehicleId={selectedVehicle}
          onClose={() => setSelectedVehicle(null)}
        >
          <VehicleDetailPanel
            key={selectedVehicle} // <--- THIS IS THE MAGIC FIX
            vehicleId={selectedVehicle}
            onClose={() => setSelectedVehicle(null)}
          />
        </VehicleDetailErrorBoundary>
      )}
    </div>
  );
}