import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = (process.env.FASTAPI_URL || 'http://127.0.0.1:8000').trim();

const readIntFromEnv = (name: string, fallback: number): number => {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const readBoolFromEnv = (name: string, fallback: boolean): boolean => {
  const value = (process.env[name] || '').trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  return fallback;
};

const WARNING_COOLDOWN_MS = readIntFromEnv('SIM_FORWARD_WARNING_COOLDOWN_MS', 30000);
const FASTAPI_FORWARD_TIMEOUT_MS = readIntFromEnv('FASTAPI_FORWARD_TIMEOUT_MS', 12000);
const FASTAPI_FORWARD_MAX_PENDING_BATCHES = readIntFromEnv('FASTAPI_FORWARD_MAX_PENDING_BATCHES', 500);
const FASTAPI_FORWARD_RETRY_BASE_MS = readIntFromEnv('FASTAPI_FORWARD_RETRY_BASE_MS', 1000);
const FASTAPI_FORWARD_RETRY_MAX_MS = readIntFromEnv('FASTAPI_FORWARD_RETRY_MAX_MS', 20000);
const FASTAPI_FORWARD_ENABLE_COALESCE = readBoolFromEnv('FASTAPI_FORWARD_ENABLE_COALESCE', true);
const FASTAPI_FORWARD_COALESCE_THRESHOLD = readIntFromEnv('FASTAPI_FORWARD_COALESCE_THRESHOLD', 25);
const FASTAPI_FORWARD_BACKLOG_WARN_AGE_MS = readIntFromEnv('FASTAPI_FORWARD_BACKLOG_WARN_AGE_MS', 60000);
const FASTAPI_FORWARD_BACKLOG_CRITICAL_AGE_MS = readIntFromEnv(
  'FASTAPI_FORWARD_BACKLOG_CRITICAL_AGE_MS',
  180000,
);
let lastForwardWarningAt = 0;

type JsonRecord = Record<string, unknown>;

type ForwardResult = {
  forwarded: boolean;
  target: string | null;
  error: string | null;
};

type ForwardQueueItem = {
  payload: unknown;
  attempts: number;
  nextAttemptAt: number;
  queuedAt: number;
  vehicleIds: string[];
  recordCount: number;
};

type QueueHealth = {
  pendingBatches: number;
  pendingRecords: number;
  oldestItemAgeMs: number;
  newestItemAgeMs: number;
  nextRetryInMs: number;
  maxPendingBatches: number;
  state: 'healthy' | 'degraded' | 'critical';
};

const forwardQueue: ForwardQueueItem[] = [];
let forwardQueueFlushTimer: ReturnType<typeof setTimeout> | null = null;
let nextForwardQueueFlushAt = 0;
let isForwardQueueFlushing = false;

const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry).trim()))
      .filter(Boolean);
    return Array.from(new Set(cleaned));
  }

  if (typeof value === 'string' && value.trim()) {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
};

const normalizeOverrideValues = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalizedEntries = Object.entries(value as JsonRecord)
    .map(([key, rawValue]) => {
      const parsed = toNumber(rawValue);
      if (!key || parsed === null) {
        return null;
      }
      return [key, parsed] as const;
    })
    .filter((entry): entry is readonly [string, number] => entry !== null);

  return Object.fromEntries(normalizedEntries);
};

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

const asVehicleId = (record: JsonRecord): string => {
  const raw = record.vehicle_id ?? record.vehicleId;
  return typeof raw === 'string' ? raw.trim() : '';
};

const extractVehicleIdsFromPayload = (payload: unknown): string[] => {
  const records = Array.isArray(payload) ? payload : [payload];
  const vehicleIds: string[] = [];

  for (const record of records) {
    if (!record || typeof record !== 'object') {
      continue;
    }
    const vehicleId = asVehicleId(record as JsonRecord);
    if (vehicleId) {
      vehicleIds.push(vehicleId);
    }
  }

  return Array.from(new Set(vehicleIds));
};

const countPayloadRecords = (payload: unknown): number => {
  if (Array.isArray(payload)) {
    const objectCount = payload.filter((record) => Boolean(record && typeof record === 'object')).length;
    return objectCount > 0 ? objectCount : payload.length;
  }
  return payload && typeof payload === 'object' ? 1 : 0;
};

const normalizeTelemetryRecord = (record: JsonRecord): JsonRecord => {
  const vehicleId =
    (typeof record.vehicle_id === 'string' && record.vehicle_id) ||
    (typeof record.vehicleId === 'string' && record.vehicleId) ||
    '';

  const manualOverrideValues = normalizeOverrideValues(
    record.manual_override_values ??
      record.manual_overrides ??
      record.manualOverrideValues ??
      record.manualOverrides
  );
  const manualOverrideKeys = Array.from(
    new Set([
      ...normalizeStringList(record.manual_override_keys ?? record.manualOverrideKeys),
      ...Object.keys(manualOverrideValues),
    ])
  );
  const manualOverrideActive = Boolean(
    (record.manual_override_active ?? record.manualOverrideActive ?? false) ||
      manualOverrideKeys.length > 0
  );

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
    manual_override_active: manualOverrideActive,
    manual_override_keys: manualOverrideKeys,
    manual_override_values: manualOverrideValues,
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

const clonePayload = (payload: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return payload;
  }
};

const getRetryDelayMs = (attempt: number): number => {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(FASTAPI_FORWARD_RETRY_MAX_MS, FASTAPI_FORWARD_RETRY_BASE_MS * 2 ** exponent);
};

const summarizeQueueHealth = (): QueueHealth => {
  const now = Date.now();
  const pendingBatches = forwardQueue.length;

  if (pendingBatches === 0) {
    return {
      pendingBatches: 0,
      pendingRecords: 0,
      oldestItemAgeMs: 0,
      newestItemAgeMs: 0,
      nextRetryInMs: 0,
      maxPendingBatches: FASTAPI_FORWARD_MAX_PENDING_BATCHES,
      state: 'healthy',
    };
  }

  const oldestItemAgeMs = Math.max(0, now - forwardQueue[0].queuedAt);
  const newestItemAgeMs = Math.max(0, now - forwardQueue[pendingBatches - 1].queuedAt);
  const nextRetryInMs = Math.max(0, forwardQueue[0].nextAttemptAt - now);
  const pendingRecords = forwardQueue.reduce((total, item) => total + item.recordCount, 0);

  let state: QueueHealth['state'] = 'healthy';
  if (
    pendingBatches >= FASTAPI_FORWARD_MAX_PENDING_BATCHES ||
    oldestItemAgeMs >= FASTAPI_FORWARD_BACKLOG_CRITICAL_AGE_MS
  ) {
    state = 'critical';
  } else if (
    pendingBatches >= FASTAPI_FORWARD_COALESCE_THRESHOLD ||
    oldestItemAgeMs >= FASTAPI_FORWARD_BACKLOG_WARN_AGE_MS
  ) {
    state = 'degraded';
  }

  return {
    pendingBatches,
    pendingRecords,
    oldestItemAgeMs,
    newestItemAgeMs,
    nextRetryInMs,
    maxPendingBatches: FASTAPI_FORWARD_MAX_PENDING_BATCHES,
    state,
  };
};

const coalesceQueuedItems = (vehicleIds: string[]): { coalescedBatches: number; coalescedRecords: number } => {
  if (
    !FASTAPI_FORWARD_ENABLE_COALESCE ||
    vehicleIds.length === 0 ||
    forwardQueue.length < FASTAPI_FORWARD_COALESCE_THRESHOLD
  ) {
    return { coalescedBatches: 0, coalescedRecords: 0 };
  }

  const trackedVehicleIds = new Set(vehicleIds);
  let coalescedBatches = 0;
  let coalescedRecords = 0;

  // Skip index 0 because it may be actively in-flight while a flush is running.
  for (let index = forwardQueue.length - 1; index >= 1; index -= 1) {
    const item = forwardQueue[index];
    const overlaps = item.vehicleIds.some((vehicleId) => trackedVehicleIds.has(vehicleId));
    if (!overlaps) {
      continue;
    }

    coalescedBatches += 1;
    coalescedRecords += item.recordCount;
    forwardQueue.splice(index, 1);
  }

  if (coalescedBatches > 0) {
    warnForwardFailure(
      `Forward queue coalesced ${coalescedBatches} stale batches (${coalescedRecords} records) to prioritize latest vehicle state.`,
    );
  }

  return { coalescedBatches, coalescedRecords };
};

const scheduleForwardQueueFlush = (delayMs = 0): void => {
  const safeDelay = Math.max(0, delayMs);
  const runAt = Date.now() + safeDelay;

  if (forwardQueueFlushTimer && runAt >= nextForwardQueueFlushAt) {
    return;
  }

  if (forwardQueueFlushTimer) {
    clearTimeout(forwardQueueFlushTimer);
  }

  nextForwardQueueFlushAt = runAt;
  forwardQueueFlushTimer = setTimeout(() => {
    forwardQueueFlushTimer = null;
    nextForwardQueueFlushAt = 0;
    void flushForwardQueue();
  }, safeDelay);
};

async function flushForwardQueue(): Promise<void> {
  if (isForwardQueueFlushing) {
    return;
  }

  isForwardQueueFlushing = true;
  try {
    while (forwardQueue.length > 0) {
      const item = forwardQueue[0];
      const waitMs = item.nextAttemptAt - Date.now();
      if (waitMs > 0) {
        scheduleForwardQueueFlush(waitMs);
        return;
      }

      const result = await forwardTelemetry(item.payload);
      if (result.forwarded) {
        forwardQueue.shift();
        continue;
      }

      item.attempts += 1;
      item.nextAttemptAt = Date.now() + getRetryDelayMs(item.attempts);
      const queueHealth = summarizeQueueHealth();
      warnForwardFailure(
        `${result.error || 'Unable to reach FastAPI backend.'} Pending queue size: ${queueHealth.pendingBatches}. ` +
          `Oldest queued age: ${queueHealth.oldestItemAgeMs}ms. ` +
          `Retrying in ${item.nextAttemptAt - Date.now()}ms.`,
      );
      scheduleForwardQueueFlush(item.nextAttemptAt - Date.now());
      return;
    }
  } finally {
    isForwardQueueFlushing = false;
    if (forwardQueue.length > 0 && !forwardQueueFlushTimer) {
      const nextDelay = Math.max(0, forwardQueue[0].nextAttemptAt - Date.now());
      scheduleForwardQueueFlush(nextDelay);
    }
  }
}

const enqueueForwardPayload = (
  payload: unknown,
): {
  pending: number;
  dropped: number;
  coalescedBatches: number;
  coalescedRecords: number;
  queueHealth: QueueHealth;
} => {
  const payloadClone = clonePayload(payload);
  const vehicleIds = extractVehicleIdsFromPayload(payloadClone);
  const recordCount = countPayloadRecords(payloadClone);
  const coalesced = coalesceQueuedItems(vehicleIds);

  let dropped = 0;
  while (forwardQueue.length >= FASTAPI_FORWARD_MAX_PENDING_BATCHES) {
    forwardQueue.shift();
    dropped += 1;
  }

  if (dropped > 0) {
    warnForwardFailure(
      `Forward queue reached ${FASTAPI_FORWARD_MAX_PENDING_BATCHES} batches and dropped ${dropped} oldest batches.`,
    );
  }

  forwardQueue.push({
    payload: payloadClone,
    attempts: 0,
    nextAttemptAt: Date.now(),
    queuedAt: Date.now(),
    vehicleIds,
    recordCount,
  });
  scheduleForwardQueueFlush(0);

  const queueHealth = summarizeQueueHealth();

  return {
    pending: forwardQueue.length,
    dropped,
    coalescedBatches: coalesced.coalescedBatches,
    coalescedRecords: coalesced.coalescedRecords,
    queueHealth,
  };
};

async function forwardTelemetry(payload: unknown): Promise<ForwardResult> {
  const candidates = buildFastApiCandidates(FASTAPI_URL);
  const errors: string[] = [];

  const attempts = candidates.map(async (baseUrl) => {
    const endpoint = `${baseUrl}/api/telematics`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(FASTAPI_FORWARD_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`FastAPI returned HTTP ${response.status} at ${endpoint}`);
      }

      return baseUrl;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const message = reason.startsWith('FastAPI returned HTTP')
        ? reason
        : `Unable to reach ${endpoint} (${reason})`;
      errors.push(message);
      throw new Error(message);
    }
  });

  try {
    const target = await Promise.any(attempts);
    return {
      forwarded: true,
      target,
      error: null,
    };
  } catch {
    const distinctErrors = Array.from(new Set(errors));
    return {
      forwarded: false,
      target: null,
      error:
        (distinctErrors.length > 0 ? distinctErrors.join(' ; ') : null) ||
        `Unable to reach FastAPI backend. Checked: ${candidates.join(', ')}.`,
    };
  }
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

    const enqueueResult = enqueueForwardPayload(forwardPayload);

    return NextResponse.json({ 
      success: true, 
      timestamp: new Date().toISOString(),
      count: normalizedRecords.length,
      forwarded: true,
      queued: true,
      pendingQueueSize: enqueueResult.pending,
      droppedFromQueue: enqueueResult.dropped,
      coalescedFromQueue: enqueueResult.coalescedBatches,
      coalescedRecordCount: enqueueResult.coalescedRecords,
      queueHealth: enqueueResult.queueHealth,
      fastapiTarget: null,
      forwardError: null,
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
  const includeQueueStatus = ['1', 'true', 'yes'].includes(
    (request.nextUrl.searchParams.get('queueStatus') || '').toLowerCase(),
  );
  const queueHealth = summarizeQueueHealth();
  
  if (vehicleId) {
    const data = vehicleData.get(vehicleId);
    if (includeQueueStatus) {
      return NextResponse.json({
        vehicle: data || null,
        queueHealth,
      });
    }
    return NextResponse.json(data || null);
  }

  if (includeQueueStatus) {
    return NextResponse.json({
      vehicles: Array.from(vehicleData.values()),
      queueHealth,
    });
  }
  
  return NextResponse.json(Array.from(vehicleData.values()));
}
