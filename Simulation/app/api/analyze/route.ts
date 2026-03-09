import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

/**
 * POST /api/analyze
 * Forwards vehicle telemetry to the FastAPI AI backend
 * and returns the predictive analysis result.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Map frontend telemetry fields → FastAPI PredictiveRequest fields
    const payload = {
      vehicle_id: body.vehicleId || 'V-301',
      metadata: {
        source: 'simulation-dashboard',
        timestamp: body.timestamp || new Date().toISOString(),
        health_score: body.healthScore,
        status: body.status,
      },
      engine_temp_c: Math.round(body.engineTemperature ?? 90),
      oil_pressure_psi: Math.round((body.oilPressure ?? 40) * 10) / 10,
      rpm: Math.round(body.rpm ?? 1500),
      battery_voltage: Math.round((body.batteryVoltage ?? 24) * 10) / 10,
      dtc_readable: body.status === 'critical' ? 'P0300 - Random Misfire' : 'None',
    };

    const response = await fetch(`${FASTAPI_URL}/api/predictive/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000), // 60s timeout for AI processing
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[analyze] FastAPI error ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: 'AI backend error', detail: errorText },
        { status: response.status },
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
      return NextResponse.json(
        { error: 'AI backend timeout — is the FastAPI server running on port 8000?' },
        { status: 504 },
      );
    }
    console.error('[analyze] Error:', error);
    return NextResponse.json(
      { error: 'Failed to contact AI backend', detail: String(error) },
      { status: 502 },
    );
  }
}
