import { NextRequest, NextResponse } from 'next/server';

// Import the same instance as start route
let fleetManager: any = null;

async function getFleetManager() {
  if (!fleetManager) {
    const { FleetManager } = await import('@/lib/fleet-manager');
    fleetManager = new FleetManager(1, 1000); // Single vehicle
    fleetManager.initialize();
  }
  return fleetManager;
}

export async function POST(request: NextRequest) {
  try {
    const manager = await getFleetManager();
    manager.stop();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Simulation stopped',
    });
  } catch (error) {
    console.error('Error stopping simulation:', error);
    return NextResponse.json(
      { error: 'Failed to stop simulation' },
      { status: 500 }
    );
  }
}
