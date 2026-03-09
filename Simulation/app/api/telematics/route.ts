import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

// In-memory storage for the latest vehicle data
// In a production app, this would be a real database
const vehicleData = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    if (Array.isArray(data)) {
      // Batch update
      for (const vehicle of data) {
        vehicleData.set(vehicle.vehicleId, {
          ...vehicle,
          receivedAt: new Date().toISOString(),
        });
      }
    } else {
      // Single update
      vehicleData.set(data.vehicleId, {
        ...data,
        receivedAt: new Date().toISOString(),
      });
    }
    
    let forwarded = true;
    try {
      await fetch(`${FASTAPI_URL}/api/telematics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (error) {
      forwarded = false;
      console.error('[telematics] Failed to forward telemetry to FastAPI backend:', error);
    }

    return NextResponse.json({ 
      success: true, 
      timestamp: new Date().toISOString(),
      count: Array.isArray(data) ? data.length : 1,
      forwarded,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process telemetry data' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const vehicleId = request.nextUrl.searchParams.get('vehicleId');
  
  if (vehicleId) {
    const data = vehicleData.get(vehicleId);
    return NextResponse.json(data || null);
  }
  
  return NextResponse.json(Array.from(vehicleData.values()));
}
