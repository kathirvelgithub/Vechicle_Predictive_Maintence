import { NextRequest, NextResponse } from 'next/server';

// This will be managed by the custom server
let fleetManager: any = null;

// Import dynamically to avoid issues
async function getFleetManager() {
  if (!fleetManager) {
    const { FleetManager } = await import('@/lib/fleet-manager');
    fleetManager = new FleetManager(1, 1000); // Single vehicle, updates every 1 second
    fleetManager.initialize();
    
    // Set up telemetry callback to broadcast via WebSocket
    fleetManager.setOnTelemetryUpdate((telemetry: any[]) => {
      if ((global as any).io) {
        // Send single vehicle data
        (global as any).io.emit('telemetry-update', telemetry[0]);
      }
    });
  }
  return fleetManager;
}

export async function POST(request: NextRequest) {
  try {
    const manager = await getFleetManager();
    manager.start();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Simulation started',
      vehicleCount: manager.getVehicleCount(),
    });
  } catch (error) {
    console.error('Error starting simulation:', error);
    return NextResponse.json(
      { error: 'Failed to start simulation' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!fleetManager) {
      return NextResponse.json({ 
        isRunning: false,
        vehicleCount: 0,
      });
    }
    
    return NextResponse.json({ 
      isRunning: fleetManager.isSimulating(),
      vehicleCount: fleetManager.getVehicleCount(),
      telemetry: fleetManager.getAllTelemetry(),
    });
  } catch (error) {
    console.error('Error getting simulation status:', error);
    return NextResponse.json(
      { error: 'Failed to get simulation status' },
      { status: 500 }
    );
  }
}
