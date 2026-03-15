// ─── Vehicle Telemetry Simulator ────────────────────────────────────────────
// Algorithm stack:
//   1. Markov driving-cycle state machine  (idle/city/highway/acceleration/braking)
//   2. Ornstein-Uhlenbeck (OU) noise process  (replaces simple Math.random drift)
//   3. NASA CMAPSS-inspired piecewise wear model  (accelerating degradation curves)
//   4. Manual parameter override API  (UI pin any of the 9 parameters)

export interface TelemetryReading {
  engineTemperature: number;   // 70–110 °C
  rpm: number;                 // 800–5000
  speed: number;               // 0–120 km/h
  batteryVoltage: number;      // 11.5–13.5 V
  oilPressure: number;         // 20–60 psi
  fuelLevel: number;           // 0–100 %
  engineLoad: number;          // 0–100 %
  tirePressure: number;        // 28–36 psi
  coolantTemperature: number;  // 70–105 °C
}

export type DrivingState = 'idle' | 'city' | 'highway' | 'acceleration' | 'braking';

export interface TelemetrySnapshot extends TelemetryReading {
  timestamp: number;
  vehicleId: string;
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical';
  alerts: Alert[];
  drivingState: DrivingState;
}

export interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  parameter: string;
  value: number;
  threshold: number;
  timestamp: number;
}

// ── helper maths ─────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rand  = (lo: number, hi: number) => Math.random() * (hi - lo) + lo;

// ── 1. Markov driving-cycle state machine ────────────────────────────────────
// Transition probability matrix: MARKOV_TRANSITIONS[from][to]
const MARKOV_TRANSITIONS: Record<DrivingState, Record<DrivingState, number>> = {
  idle:         { idle: 0.60, city: 0.35, highway: 0.00, acceleration: 0.05, braking: 0.00 },
  city:         { idle: 0.08, city: 0.55, highway: 0.15, acceleration: 0.15, braking: 0.07 },
  highway:      { idle: 0.01, city: 0.10, highway: 0.72, acceleration: 0.12, braking: 0.05 },
  acceleration: { idle: 0.00, city: 0.25, highway: 0.30, acceleration: 0.35, braking: 0.10 },
  braking:      { idle: 0.25, city: 0.50, highway: 0.05, acceleration: 0.00, braking: 0.20 },
};

// Minimum ticks before a state transition is allowed (geometric inter-dwell)
const STATE_MIN_DWELL: Record<DrivingState, number> = {
  idle: 3, city: 4, highway: 6, acceleration: 2, braking: 2,
};

// Target OU means (μ) for speed / RPM / load per driving state
interface StateTarget { speedMu: number; rpmMu: number; loadMu: number; }
const STATE_TARGETS: Record<DrivingState, StateTarget> = {
  idle:         { speedMu: 0,   rpmMu: 820,  loadMu: 7   },
  city:         { speedMu: 35,  rpmMu: 2000, loadMu: 40  },
  highway:      { speedMu: 95,  rpmMu: 2600, loadMu: 55  },
  acceleration: { speedMu: 75,  rpmMu: 3800, loadMu: 85  },
  braking:      { speedMu: 20,  rpmMu: 900,  loadMu: 5   },
};

function sampleMarkov(from: DrivingState): DrivingState {
  const row = MARKOV_TRANSITIONS[from];
  let r = Math.random();
  for (const [state, p] of Object.entries(row) as [DrivingState, number][]) {
    r -= p;
    if (r <= 0) return state;
  }
  return from;
}

// ── 2. Ornstein-Uhlenbeck noise process ──────────────────────────────────────
// dX = θ(μ − X) + σ·ε   where ε ~ N(0,1)  (Box-Muller)
function gaussianNoise(): number {
  const u1 = Math.random() + 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function ouStep(x: number, mu: number, theta: number, sigma: number): number {
  return x + theta * (mu - x) + sigma * gaussianNoise();
}

// OU hyper-parameters per field (theta = mean-reversion speed, sigma = volatility)
const OU = {
  engineTemperature:  { theta: 0.18, sigma: 0.80 },
  rpm:                { theta: 0.20, sigma: 80   },
  speed:              { theta: 0.15, sigma: 2.50 },
  batteryVoltage:     { theta: 0.30, sigma: 0.04 },
  oilPressure:        { theta: 0.25, sigma: 0.80 },
  engineLoad:         { theta: 0.22, sigma: 2.00 },
  tirePressure:       { theta: 0.08, sigma: 0.12 },
  coolantTemperature: { theta: 0.15, sigma: 0.60 },
};

// ── 3. NASA CMAPSS piecewise wear rate ───────────────────────────────────────
// Based on FD001 run-to-failure curves: wear accelerates non-linearly as health declines.
// rate_multiplier = 1 + 2·(1 − health/100)²
function cmapssRate(baseRate: number, health: number): number {
  const h = clamp(health, 0, 100);
  return baseRate * (1 + 2 * (1 - h / 100) ** 2);
}

// ── simulator class ──────────────────────────────────────────────────────────
export class VehicleSimulator {
  private state: TelemetryReading;
  private vehicleId: string;
  private anomalyChance = 0.04;

  // Markov state
  private drivingState: DrivingState = 'city';
  private stateDwell = 0;

  // CMAPSS component health (0-100 %)
  private componentHealth = {
    engine: 100, brakes: 100, battery: 100, cooling: 100, tires: 100,
  };
  private operationalHours = 0;

  // 4. Manual override map  (key → pinned value; absent = not overridden)
  private overrides: Partial<TelemetryReading> = {};

  constructor(vehicleId: string = 'VH-001') {
    this.vehicleId = vehicleId;
    this.state = this.initialState();
  }

  private initialState(): TelemetryReading {
    return {
      engineTemperature: rand(80, 92),
      rpm:               rand(900, 2500),
      speed:             rand(30, 80),
      batteryVoltage:    rand(12.2, 13.0),
      oilPressure:       rand(32, 50),
      fuelLevel:         rand(60, 95),
      engineLoad:        rand(30, 65),
      tirePressure:      rand(30, 34),
      coolantTemperature:rand(78, 90),
    };
  }

  // ── Step 1: Markov transition ───────────────────────────────────────────────
  private advanceDrivingState() {
    this.stateDwell++;
    if (this.stateDwell >= STATE_MIN_DWELL[this.drivingState]) {
      const next = sampleMarkov(this.drivingState);
      if (next !== this.drivingState) {
        this.drivingState = next;
        this.stateDwell = 0;
      }
    }
  }

  // ── Step 3: CMAPSS piecewise wear update ───────────────────────────────────
  // dt = 1 tick ≈ 2 real seconds = 1/1800 operating hour
  private updateWear() {
    const dt = 1 / 1800;
    this.operationalHours += dt;
    const harsh = this.drivingState === 'acceleration' || this.drivingState === 'braking';
    const hm = harsh ? 2.5 : 1.0;
    const bm = this.drivingState === 'braking' ? 4.0 : 1.0;

    this.componentHealth.engine  = Math.max(0, this.componentHealth.engine  - cmapssRate(0.003, this.componentHealth.engine)  * dt * hm);
    this.componentHealth.brakes  = Math.max(0, this.componentHealth.brakes  - cmapssRate(0.005, this.componentHealth.brakes)  * dt * bm);
    this.componentHealth.battery = Math.max(0, this.componentHealth.battery - cmapssRate(0.002, this.componentHealth.battery) * dt);
    this.componentHealth.cooling = Math.max(0, this.componentHealth.cooling - cmapssRate(0.002, this.componentHealth.cooling) * dt);
    this.componentHealth.tires   = Math.max(0, this.componentHealth.tires   - cmapssRate(0.004, this.componentHealth.tires)   * dt * hm);
  }

  /** Advance the simulation by one tick and return a full snapshot. */
  tick(): TelemetrySnapshot {
    // 1. Markov: advance driving state
    this.advanceDrivingState();
    const targets = STATE_TARGETS[this.drivingState];

    // 2. Degradation factors derived from CMAPSS wear
    const engDeg  = (100 - this.componentHealth.engine)  / 100;
    const coolDeg = (100 - this.componentHealth.cooling)  / 100;
    const batDeg  = (100 - this.componentHealth.battery)  / 100;
    const tireDeg = (100 - this.componentHealth.tires)    / 100;

    // Compute degraded OU means (wear shifts parameter targets toward failure values)
    const muEngTemp  = (targets.speedMu === 0 ? 76 : 86 + (targets.rpmMu / 5000) * 18) + engDeg  * 14;
    const muCoolant  = muEngTemp * 0.92 + coolDeg * 6;
    const muOilPsi   = 22 + (targets.rpmMu / 5000) * 36 - engDeg  * 10;
    const muBatV     = 12.6 + (targets.rpmMu / 5000) * 0.8  - batDeg  * 0.5;
    const muTirePsi  = 32 - tireDeg * 4;

    // 2. OU steps toward degraded targets
    this.state.engineTemperature  = clamp(ouStep(this.state.engineTemperature,  muEngTemp,       OU.engineTemperature.theta,  OU.engineTemperature.sigma  + engDeg  * 0.5), 70, 115);
    this.state.rpm                = clamp(ouStep(this.state.rpm,                targets.rpmMu,   OU.rpm.theta,                OU.rpm.sigma                             ), 700, 5500);
    this.state.speed              = clamp(ouStep(this.state.speed,              targets.speedMu, OU.speed.theta,              OU.speed.sigma                           ),   0, 140);
    this.state.engineLoad         = clamp(ouStep(this.state.engineLoad,         targets.loadMu,  OU.engineLoad.theta,         OU.engineLoad.sigma                      ),   0, 100);
    this.state.coolantTemperature = clamp(ouStep(this.state.coolantTemperature, muCoolant,       OU.coolantTemperature.theta, OU.coolantTemperature.sigma + coolDeg * 0.4), 70, 110);
    this.state.oilPressure        = clamp(ouStep(this.state.oilPressure,        muOilPsi,        OU.oilPressure.theta,        OU.oilPressure.sigma                     ),  15,  72);
    this.state.batteryVoltage     = clamp(ouStep(this.state.batteryVoltage,     muBatV,          OU.batteryVoltage.theta,     OU.batteryVoltage.sigma + batDeg  * 0.02  ),  11.0, 14.5);
    this.state.tirePressure       = clamp(ouStep(this.state.tirePressure,       muTirePsi,       OU.tirePressure.theta,        OU.tirePressure.sigma                    ),  26,  38);

    // Fuel drains by state (idle uses almost none, braking regenerates slightly, accel uses most)
    const fuelRate = this.drivingState === 'idle'        ? 0.004
                   : this.drivingState === 'braking'     ? 0.001
                   : this.drivingState === 'highway'     ? 0.018
                   : this.drivingState === 'acceleration'? 0.030
                   : 0.012; // city
    this.state.fuelLevel = clamp(this.state.fuelLevel - fuelRate, 0, 100);

    // 3. CMAPSS wear update
    this.updateWear();

    // 4. Random anomaly injection (chance increases as components degrade)
    const degradedChance = this.anomalyChance + engDeg * 0.04;
    if (Math.random() < degradedChance) this.injectAnomaly();

    // Apply manual overrides — override bypasses simulation, pins the value
    const finalState: TelemetryReading = { ...this.state };
    for (const [k, v] of Object.entries(this.overrides)) {
      if (v !== undefined) (finalState as Record<string, number>)[k] = v;
    }

    // Build snapshot
    const alerts     = this.evaluateAlerts(finalState);
    const healthScore = this.computeHealth(finalState);
    const status: TelemetrySnapshot['status'] =
      healthScore >= 75 ? 'healthy' : healthScore >= 45 ? 'warning' : 'critical';

    return {
      ...finalState,
      timestamp:    Date.now(),
      vehicleId:    this.vehicleId,
      healthScore,
      status,
      alerts,
      drivingState: this.drivingState,
    };
  }

  // ── 4. Manual override API ─────────────────────────────────────────────────
  setOverride(key: keyof TelemetryReading, value: number | null) {
    if (value === null) {
      delete this.overrides[key];
    } else {
      this.overrides[key] = value;
    }
  }
  clearOverrides()                         { this.overrides = {}; }
  getOverrides(): Partial<TelemetryReading> { return { ...this.overrides }; }
  getComponentHealth()                     { return { ...this.componentHealth }; }
  getDrivingState(): DrivingState          { return this.drivingState; }
  getOperationalHours(): number            { return this.operationalHours; }

  reset() {
    this.state            = this.initialState();
    this.drivingState     = 'city';
    this.stateDwell       = 0;
    this.operationalHours = 0;
    this.componentHealth  = { engine: 100, brakes: 100, battery: 100, cooling: 100, tires: 100 };
    this.overrides        = {};
  }

  // ── anomaly injection ──────────────────────────────────────────────────────
  private injectAnomaly() {
    switch (Math.floor(Math.random() * 4)) {
      case 0: this.state.engineTemperature  = rand(104, 110);  break;
      case 1: this.state.oilPressure        = rand(12,  18);   break;
      case 2: this.state.batteryVoltage     = rand(11.0, 11.4); break;
      case 3: this.state.coolantTemperature = rand(100, 105);  break;
    }
  }

  // ── alert evaluation ───────────────────────────────────────────────────────
  private evaluateAlerts(s: TelemetryReading): Alert[] {
    const now = Date.now();
    const out: Alert[] = [];
    const a = (id: string, type: Alert['type'], message: string, parameter: string, value: number, threshold: number) =>
      out.push({ id: `${id}-${now}`, type, message, parameter, value, threshold, timestamp: now });

    if      (s.engineTemperature  > 105) a('et',  'critical', 'Engine overheating detected!',    'engineTemperature',  s.engineTemperature,  105);
    else if (s.engineTemperature  >  98) a('et',  'warning',  'Engine temperature rising',        'engineTemperature',  s.engineTemperature,   98);
    if      (s.oilPressure        <  15) a('op',  'critical', 'Oil pressure critically low!',     'oilPressure',        s.oilPressure,         15);
    else if (s.oilPressure        <  25) a('op',  'warning',  'Low oil pressure warning',         'oilPressure',        s.oilPressure,         25);
    if      (s.batteryVoltage     < 11.5)a('bv',  'critical', 'Battery voltage critically low!',  'batteryVoltage',     s.batteryVoltage,      11.5);
    else if (s.batteryVoltage     < 12.0)a('bv',  'warning',  'Low battery voltage',              'batteryVoltage',     s.batteryVoltage,      12.0);
    if      (s.coolantTemperature > 100) a('ct',  'warning',  'Coolant temperature high',         'coolantTemperature', s.coolantTemperature,  100);
    if      (s.fuelLevel          <  15) a('fl',  'warning',  'Fuel level low',                   'fuelLevel',          s.fuelLevel,            15);
    if      (s.tirePressure       <  29) a('tp',  'warning',  'Low tire pressure',                'tirePressure',       s.tirePressure,         29);
    if      (s.rpm                > 4500)a('rpm', 'warning',  'High RPM – engine stress',         'rpm',                s.rpm,                4500);
    return out;
  }

  // ── health score ───────────────────────────────────────────────────────────
  private computeHealth(s: TelemetryReading): number {
    let score = 100;
    if      (s.engineTemperature  > 105) score -= 25;
    else if (s.engineTemperature  >  98) score -= 10;
    if      (s.oilPressure        <  15) score -= 25;
    else if (s.oilPressure        <  25) score -= 10;
    if      (s.batteryVoltage     < 11.5)score -= 20;
    else if (s.batteryVoltage     < 12.0)score -= 8;
    if      (s.coolantTemperature > 100) score -= 12;
    if      (s.rpm                > 4500)score -= 8;
    if      (s.fuelLevel          <  10) score -= 10;
    else if (s.fuelLevel          <  20) score -= 5;
    if      (s.tirePressure       <  29) score -= 5;

    return clamp(score, 0, 100);
  }
}
