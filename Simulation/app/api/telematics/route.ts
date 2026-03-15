import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = (process.env.FASTAPI_URL || 'http://127.0.0.1:8000').trim();

const readIntFromEnv = (name: string, fallback: number): number => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const WARNING_COOLDOWN_MS = readIntFromEnv('SIM_FORWARD_WARNING_COOLDOWN_MS', 30000);
const FASTAPI_FORWARD_TIMEOUT_MS = readIntFromEnv('FASTAPI_FORWARD_TIMEOUT_MS', 5000);
let lastForwardWarningAt = 0;

type JsonRecord = Record<string, unknown>;

const toNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRounded = (value: unknown, digits = 1): number | null => {
  const parsed = toNumber(value);
  if (parsed === null) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const toInteger = (value: unknown): number | null => {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.round(parsed);
};

const normalizeTimestamp = (value: unknown): string => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  const asNumber = toNumber(value);
  if (asNumber !== null) {
    const isMillis = asNumber > 10_000_000_000;
    const date = new Date(isMillis ? asNumber : asNumber * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
};

const compactObject = (value: JsonRecord): JsonRecord => {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)
  );
};

const normalizeTelemetryRecord = (record: JsonRecord): JsonRecord => {
  const vehicleId =
    (typeof record.vehicle_id === 'string' && record.vehicle_id) ||
    (typeof record.vehicleId === 'string' && record.vehicleId) ||
    '';

  const normalized: JsonRecord = {
    vehicle_id: vehicleId,
    timestamp_utc: normalizeTimestamp(record.timestamp_utc ?? record.timestamp),
    speed_kmh: toRounded(record.speed_kmh ?? record.speed, 1),
    rpm: toInteger(record.rpm),
    engine_temp_c: toRounded(record.engine_temp_c ?? record.engineTemperature ?? record.engineTemp, 1),
    oil_pressure_psi: toRounded(record.oil_pressure_psi ?? record.oilPressure ?? record.oil_pressure, 1),
    coolant_temp_c: toRounded(record.coolant_temp_c ?? record.coolantTemperature ?? record.coolantTemp, 1),
    fuel_level_percent: toRounded(record.fuel_level_percent ?? record.fuelLevel, 1),
    battery_voltage: toRounded(record.battery_voltage ?? record.batteryVoltage, 1),
    latitude: toRounded(record.latitude, 6),
    longitude: toRounded(record.longitude, 6),
    anomaly_detected: Boolean(record.anomaly_detected ?? record.anomalyDetected ?? record.status === 'critical'),
  };

  if (!normalized.vehicle_id) {
    normalized.vehicle_id = `SIM-${Date.now()}`;
  }

  return compactObject(normalized);
};

function buildFastApiCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/$/, '');
  const candidates = [normalized];

  try {
    const url = new URL(normalized);
    if (url.hostname === 'localhost') {
      url.hostname = '127.0.0.1';
      candidates.push(url.toString().replace(/\/$/, ''));
    } else if (url.hostname === '127.0.0.1') {
      url.hostname = 'localhost';
      candidates.push(url.toString().replace(/\/$/, ''));
    }
  } catch {
    // Keep the provided URL when it cannot be parsed.
  }

  return Array.from(new Set(candidates));
}

function warnForwardFailure(message: string) {
  const now = Date.now();
  if (now - lastForwardWarningAt < WARNING_COOLDOWN_MS) {
    return;
  }

  lastForwardWarningAt = now;
  console.warn(`[telematics] ${message}`);
}

async function forwardTelemetry(payload: unknown): Promise<{ forwarded: boolean; target: string | null; error: string | null }> {
  const candidates = buildFastApiCandidates(FASTAPI_URL);
  let lastError: string | null = null;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}/api/telematics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FASTAPI_FORWARD_TIMEOUT_MS),
      });

      if (!response.ok) {
        lastError = `FastAPI returned HTTP ${response.status} at ${baseUrl}/api/telematics`;
        continue;
      }

      return {
        forwarded: true,
        target: baseUrl,
        error: null,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      lastError = `Unable to reach ${baseUrl}/api/telematics (${reason})`;
    }
  }

  return {
    forwarded: false,
    target: null,
    error:
      lastError ||
      `Unable to reach FastAPI backend. Checked: ${candidates.join(', ')}.`,
  };
}

// In-memory storage for the latest vehicle data
// In a production app, this would be a real database
const vehicleData = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const incomingRecords = (Array.isArray(payload) ? payload : [payload]).filter(
      (entry): entry is JsonRecord => Boolean(entry && typeof entry === 'object')
    );

    const normalizedRecords = incomingRecords.map(normalizeTelemetryRecord);

    if (Array.isArray(payload)) {
      // Batch update
      for (const vehicle of normalizedRecords) {
        const key = String(vehicle.vehicle_id || 'unknown');
        vehicleData.set(key, {
          ...vehicle,
          receivedAt: new Date().toISOString(),
        });
      }
    } else {
      // Single update
      const vehicle = normalizedRecords[0] || {};
      const key = String(vehicle.vehicle_id || 'unknown');
      vehicleData.set(key, {
        ...vehicle,
        receivedAt: new Date().toISOString(),
      });
    }

    const forwardPayload = Array.isArray(payload)
      ? normalizedRecords
      : (normalizedRecords[0] || {});

    const forwardResult = await forwardTelemetry(forwardPayload);
    if (!forwardResult.forwarded && forwardResult.error) {
      warnForwardFailure(
        `${forwardResult.error}. Ensure FastAPI is running or set FASTAPI_URL explicitly.`,
      );
    }

    return NextResponse.json({ 
      success: true, 
      timestamp: new Date().toISOString(),
      count: normalizedRecords.length,
      forwarded: forwardResult.forwarded,
      fastapiTarget: forwardResult.target,
      forwardError: forwardResult.error,
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
