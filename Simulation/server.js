const fs = require('fs');
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

function readIntFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clearStaleNextDevCache() {
  if (!dev) {
    return;
  }

  const shouldClear = String(process.env.SIM_CLEAR_NEXT_CACHE ?? 'false').toLowerCase() === 'true';
  if (!shouldClear) {
    return;
  }

  const nextDevPath = path.join(__dirname, '.next', 'dev');
  try {
    fs.rmSync(nextDevPath, { recursive: true, force: true });
    console.log('> Cleared stale .next/dev cache');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('> Unable to clear .next/dev cache:', message);
  }
}

clearStaleNextDevCache();

const app = next({
  dev,
  hostname,
  port,
  // Turbopack can intermittently trigger stale dev chunk URLs with the custom server.
  // Defaulting to webpack makes the simulator frontend more stable.
  webpack: String(process.env.SIM_USE_WEBPACK ?? 'true').toLowerCase() !== 'false',
  turbopack: false,
});
const handle = app.getRequestHandler();

const FASTAPI_PROXY_URL = `http://${hostname}:${port}/api/telematics`;
const AUTOPUSH_START_DELAY_MS = readIntFromEnv('SIM_AUTOPUSH_START_DELAY_MS', 4000);
const AUTOPUSH_INTERVAL_MS = readIntFromEnv('SIM_AUTOPUSH_INTERVAL_MS', 6000);
const AUTOPUSH_REQUEST_TIMEOUT_MS = readIntFromEnv('SIM_AUTOPUSH_REQUEST_TIMEOUT_MS', 6000);
const AUTOPUSH_WARNING_COOLDOWN_MS = readIntFromEnv('SIM_AUTOPUSH_WARNING_COOLDOWN_MS', 12000);
const AUTOPUSH_WARMUP_TIMEOUT_MS = readIntFromEnv('SIM_AUTOPUSH_WARMUP_TIMEOUT_MS', 12000);
const FASTAPI_READY_URL = (process.env.SIM_FASTAPI_READY_URL || 'http://127.0.0.1:8000/health/ready').trim();
const FASTAPI_READY_TIMEOUT_MS = readIntFromEnv('SIM_FASTAPI_READY_TIMEOUT_MS', 3000);
const FASTAPI_READY_RETRY_MS = readIntFromEnv('SIM_FASTAPI_READY_RETRY_MS', 1000);
const FASTAPI_READY_MAX_ATTEMPTS = readIntFromEnv('SIM_FASTAPI_READY_MAX_ATTEMPTS', 90);

let lastAutopushWarningAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function warnAutopush(...args) {
  const now = Date.now();
  if (now - lastAutopushWarningAt < AUTOPUSH_WARNING_COOLDOWN_MS) {
    return;
  }

  lastAutopushWarningAt = now;
  console.warn(...args);
}

async function warmupTelematicsRoute() {
  try {
    await fetch(FASTAPI_PROXY_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(AUTOPUSH_WARMUP_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnAutopush('[sim-autopush] Warm-up request did not complete:', message);
  }
}

async function probeFastApiReadiness() {
  try {
    const response = await fetch(FASTAPI_READY_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FASTAPI_READY_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ready: false,
        reason: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ready: true,
        reason: 'non-json response treated as ready',
      };
    }

    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== 'object') {
      return {
        ready: false,
        reason: 'invalid JSON body from readiness endpoint',
      };
    }

    return {
      ready: Boolean(payload.ready),
      reason: payload.ready ? 'ready=true' : `ready=false (${payload.reason || 'not ready'})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ready: false,
      reason: message,
    };
  }
}

async function waitForFastApiReadiness() {
  for (let attempt = 1; attempt <= FASTAPI_READY_MAX_ATTEMPTS; attempt += 1) {
    const probe = await probeFastApiReadiness();
    if (probe.ready) {
      return true;
    }

    if (attempt === 1 || attempt % 5 === 0 || attempt === FASTAPI_READY_MAX_ATTEMPTS) {
      warnAutopush(
        `[sim-autopush] Waiting for backend readiness at ${FASTAPI_READY_URL} ` +
          `(attempt ${attempt}/${FASTAPI_READY_MAX_ATTEMPTS}): ${probe.reason}`,
      );
    }

    await sleep(FASTAPI_READY_RETRY_MS);
  }

  return false;
}

const FLEET_IDS = ['V-301', 'V-302', 'V-303', 'V-304', 'V-401', 'V-402', 'V-403'];
const stateByVehicle = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function jitter(value, delta, min, max, digits = 1) {
  const next = clamp(value + (Math.random() * 2 - 1) * delta, min, max);
  const factor = 10 ** digits;
  return Math.round(next * factor) / factor;
}

function createInitialState(vehicleId, index) {
  return {
    vehicleId,
    engineTemperature: 84 + index * 2,
    oilPressure: 42 - index,
    rpm: 1400 + index * 120,
    batteryVoltage: 24.2 - index * 0.08,
    speed: 36 + index * 3,
    fuelLevel: 78 - index * 2,
  };
}

function buildTelemetryBatch() {
  return FLEET_IDS.map((vehicleId, index) => {
    const previous = stateByVehicle.get(vehicleId) || createInitialState(vehicleId, index);
    const isStressCycle = Math.random() < 0.12;

    const next = {
      vehicleId,
      engineTemperature: jitter(previous.engineTemperature, isStressCycle ? 4.8 : 1.6, 78, 123),
      oilPressure: jitter(previous.oilPressure, isStressCycle ? 3.8 : 1.4, 14, 48),
      rpm: Math.round(jitter(previous.rpm, isStressCycle ? 460 : 180, 900, 4300, 0)),
      batteryVoltage: jitter(previous.batteryVoltage, 0.18, 22.8, 25.2),
      speed: jitter(previous.speed, 6.5, 0, 110),
      fuelLevel: jitter(previous.fuelLevel, 0.35, 18, 100),
    };

    stateByVehicle.set(vehicleId, next);

    return {
      vehicle_id: vehicleId,
      vehicleId,
      timestamp: new Date().toISOString(),
      engine_temp_c: next.engineTemperature,
      engineTemperature: next.engineTemperature,
      oil_pressure_psi: next.oilPressure,
      oilPressure: next.oilPressure,
      rpm: next.rpm,
      battery_voltage: next.batteryVoltage,
      batteryVoltage: next.batteryVoltage,
      speed_kmh: next.speed,
      speed: next.speed,
      fuel_level_percent: next.fuelLevel,
      fuelLevel: next.fuelLevel,
      status: next.engineTemperature > 108 || next.oilPressure < 20 ? 'critical' : 'healthy',
    };
  });
}

async function pushTelemetryBatch() {
  if (pushTelemetryBatch.inFlight) {
    return;
  }

  pushTelemetryBatch.inFlight = true;
  const batch = buildTelemetryBatch();
  try {
    const response = await fetch(FASTAPI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(AUTOPUSH_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      warnAutopush('[sim-autopush] Failed to push batch:', response.status, response.statusText);
    } else {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);
        if (payload && payload.forwarded === false && payload.queued !== true) {
          warnAutopush(
            '[sim-autopush] Proxy accepted batch but forward failed:',
            payload.forwardError || 'unknown error',
          );
        }
        if (payload && Number(payload.droppedFromQueue || 0) > 0) {
          warnAutopush(
            '[sim-autopush] Forward queue overflowed and dropped old batches:',
            Number(payload.droppedFromQueue || 0),
          );
        }
        if (payload && Number(payload.coalescedFromQueue || 0) > 0) {
          warnAutopush(
            '[sim-autopush] Forward queue coalesced stale batches:',
            Number(payload.coalescedFromQueue || 0),
          );
        }
        if (payload && payload.queueHealth && typeof payload.queueHealth === 'object') {
          const queueState = String(payload.queueHealth.state || 'healthy').toLowerCase();
          if (queueState !== 'healthy') {
            const pending = Number(payload.queueHealth.pendingBatches || 0);
            const pendingRecords = Number(payload.queueHealth.pendingRecords || 0);
            const oldestAgeMs = Number(payload.queueHealth.oldestItemAgeMs || 0);
            warnAutopush(
              `[sim-autopush] Forward queue ${queueState}: pending=${pending} batches, ` +
                `pendingRecords=${pendingRecords}, oldestAgeMs=${oldestAgeMs}`,
            );
          }
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnAutopush('[sim-autopush] Push error:', message);
  } finally {
    pushTelemetryBatch.inFlight = false;
  }
}

pushTelemetryBatch.inFlight = false;

function startAutopushLoop() {
  const enabled = String(process.env.SIM_AUTOPUSH ?? 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('> Simulation autopush disabled via SIM_AUTOPUSH=false');
    return;
  }

  void (async () => {
    const ready = await waitForFastApiReadiness();
    if (!ready) {
      console.error(
        `[sim-autopush] Backend readiness check failed after ${FASTAPI_READY_MAX_ATTEMPTS} attempts. ` +
          'Autopush will remain disabled.',
      );
      return;
    }

    console.log(`> FastAPI readiness confirmed at ${FASTAPI_READY_URL}`);
    console.log(
      `> Simulation autopush enabled (${FLEET_IDS.length} vehicles every ${AUTOPUSH_INTERVAL_MS}ms, start delay ${AUTOPUSH_START_DELAY_MS}ms)`,
    );

    setTimeout(async () => {
      await warmupTelematicsRoute();
      void pushTelemetryBatch();
      setInterval(() => {
        void pushTelemetryBatch();
      }, AUTOPUSH_INTERVAL_MS);
    }, AUTOPUSH_START_DELAY_MS);
  })();
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/api/socket',
  });

  // Make io globally accessible
  global.io = io;

  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });

    socket.on('request-telemetry', () => {
      // Client is requesting telemetry data
      socket.emit('telemetry-ready');
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket server ready on ws://${hostname}:${port}/api/socket`);
    startAutopushLoop();
  });
});
