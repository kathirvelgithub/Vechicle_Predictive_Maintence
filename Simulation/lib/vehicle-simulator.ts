// ─── Vehicle Telemetry Simulator ───────────────────────────────────────
// Generates realistic telemetry for a single vehicle (VH-001)
// with 9 core parameters and health/alert logic.

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

export interface TelemetrySnapshot extends TelemetryReading {
  timestamp: number;
  vehicleId: string;
  healthScore: number;
  status: 'healthy' | 'warning' | 'critical';
  alerts: Alert[];
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

// ── helper maths ──────────────────────────────────────────────────────
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

const rand = (min: number, max: number) =>
  Math.random() * (max - min) + min;

const drift = (current: number, min: number, max: number, maxStep: number) => {
  const step = (Math.random() - 0.48) * maxStep; // slight upward bias
  return clamp(current + step, min, max);
};

// ── simulator class ───────────────────────────────────────────────────
export class VehicleSimulator {
  private state: TelemetryReading;
  private vehicleId: string;
  private running = false;
  private fuelDrainRate = 0.03; // per tick
  private anomalyChance = 0.04; // 4 % chance per tick

  constructor(vehicleId: string = 'VH-001') {
    this.vehicleId = vehicleId;
    this.state = {
      engineTemperature: rand(80, 92),
      rpm: rand(900, 2500),
      speed: rand(30, 80),
      batteryVoltage: rand(12.2, 13.0),
      oilPressure: rand(32, 50),
      fuelLevel: rand(60, 95),
      engineLoad: rand(30, 65),
      tirePressure: rand(30, 34),
      coolantTemperature: rand(78, 90),
    };
  }

  /** Advance the simulation by one tick and return a full snapshot. */
  tick(): TelemetrySnapshot {
    // Drive-state dependent correlations
    const accelerating = Math.random() > 0.5;
    const loadBias = accelerating ? 4 : -2;
    const rpmBias = accelerating ? 200 : -100;

    // Drift every value
    this.state.rpm = drift(this.state.rpm + rpmBias, 800, 5000, 300);
    this.state.speed = drift(
      this.state.speed + (this.state.rpm > 3000 ? 3 : -1),
      0, 120, 8,
    );
    this.state.engineLoad = drift(this.state.engineLoad + loadBias, 0, 100, 6);

    // Temperature correlates with load & RPM
    const heatFactor = (this.state.engineLoad / 100) * 0.3 + (this.state.rpm / 5000) * 0.25;
    this.state.engineTemperature = drift(
      this.state.engineTemperature + heatFactor,
      70, 110, 2.5,
    );
    this.state.coolantTemperature = drift(
      this.state.coolantTemperature + heatFactor * 0.8,
      70, 105, 2,
    );

    this.state.batteryVoltage = drift(this.state.batteryVoltage, 11.5, 13.5, 0.15);
    this.state.oilPressure = drift(this.state.oilPressure, 20, 60, 3);
    this.state.tirePressure = drift(this.state.tirePressure, 28, 36, 0.5);
    this.state.fuelLevel = clamp(
      this.state.fuelLevel - this.fuelDrainRate * (this.state.engineLoad / 50),
      0, 100,
    );

    // Random anomaly injection
    if (Math.random() < this.anomalyChance) {
      this.injectAnomaly();
    }

    // Build snapshot
    const alerts = this.evaluateAlerts();
    const healthScore = this.computeHealth();
    const status: TelemetrySnapshot['status'] =
      healthScore >= 75 ? 'healthy' : healthScore >= 45 ? 'warning' : 'critical';

    return {
      ...this.state,
      timestamp: Date.now(),
      vehicleId: this.vehicleId,
      healthScore,
      status,
      alerts,
    };
  }

  reset() {
    this.state = {
      engineTemperature: rand(80, 92),
      rpm: rand(900, 2500),
      speed: rand(30, 80),
      batteryVoltage: rand(12.2, 13.0),
      oilPressure: rand(32, 50),
      fuelLevel: rand(60, 95),
      engineLoad: rand(30, 65),
      tirePressure: rand(30, 34),
      coolantTemperature: rand(78, 90),
    };
  }

  // ── anomaly injection ───────────────────────────────────────────────
  private injectAnomaly() {
    const pick = Math.floor(Math.random() * 4);
    switch (pick) {
      case 0:
        this.state.engineTemperature = rand(104, 110);
        break;
      case 1:
        this.state.oilPressure = rand(12, 18);
        break;
      case 2:
        this.state.batteryVoltage = rand(11.0, 11.4);
        break;
      case 3:
        this.state.coolantTemperature = rand(100, 105);
        break;
    }
  }

  // ── alert evaluation ────────────────────────────────────────────────
  private evaluateAlerts(): Alert[] {
    const now = Date.now();
    const out: Alert[] = [];

    if (this.state.engineTemperature > 105) {
      out.push({
        id: `et-${now}`,
        type: 'critical',
        message: 'Engine overheating detected!',
        parameter: 'engineTemperature',
        value: this.state.engineTemperature,
        threshold: 105,
        timestamp: now,
      });
    } else if (this.state.engineTemperature > 98) {
      out.push({
        id: `et-${now}`,
        type: 'warning',
        message: 'Engine temperature rising',
        parameter: 'engineTemperature',
        value: this.state.engineTemperature,
        threshold: 98,
        timestamp: now,
      });
    }

    if (this.state.oilPressure < 15) {
      out.push({
        id: `op-${now}`,
        type: 'critical',
        message: 'Oil pressure critically low!',
        parameter: 'oilPressure',
        value: this.state.oilPressure,
        threshold: 15,
        timestamp: now,
      });
    } else if (this.state.oilPressure < 25) {
      out.push({
        id: `op-${now}`,
        type: 'warning',
        message: 'Low oil pressure warning',
        parameter: 'oilPressure',
        value: this.state.oilPressure,
        threshold: 25,
        timestamp: now,
      });
    }

    if (this.state.batteryVoltage < 11.5) {
      out.push({
        id: `bv-${now}`,
        type: 'critical',
        message: 'Battery voltage critically low!',
        parameter: 'batteryVoltage',
        value: this.state.batteryVoltage,
        threshold: 11.5,
        timestamp: now,
      });
    } else if (this.state.batteryVoltage < 12.0) {
      out.push({
        id: `bv-${now}`,
        type: 'warning',
        message: 'Low battery voltage',
        parameter: 'batteryVoltage',
        value: this.state.batteryVoltage,
        threshold: 12.0,
        timestamp: now,
      });
    }

    if (this.state.coolantTemperature > 100) {
      out.push({
        id: `ct-${now}`,
        type: 'warning',
        message: 'Coolant temperature high',
        parameter: 'coolantTemperature',
        value: this.state.coolantTemperature,
        threshold: 100,
        timestamp: now,
      });
    }

    if (this.state.fuelLevel < 15) {
      out.push({
        id: `fl-${now}`,
        type: 'warning',
        message: 'Fuel level low',
        parameter: 'fuelLevel',
        value: this.state.fuelLevel,
        threshold: 15,
        timestamp: now,
      });
    }

    if (this.state.tirePressure < 29) {
      out.push({
        id: `tp-${now}`,
        type: 'warning',
        message: 'Low tire pressure',
        parameter: 'tirePressure',
        value: this.state.tirePressure,
        threshold: 29,
        timestamp: now,
      });
    }

    if (this.state.rpm > 4500) {
      out.push({
        id: `rpm-${now}`,
        type: 'warning',
        message: 'High RPM – engine stress',
        parameter: 'rpm',
        value: this.state.rpm,
        threshold: 4500,
        timestamp: now,
      });
    }

    return out;
  }

  // ── health score ────────────────────────────────────────────────────
  private computeHealth(): number {
    let score = 100;

    // Engine temperature penalties
    if (this.state.engineTemperature > 105) score -= 25;
    else if (this.state.engineTemperature > 98) score -= 10;

    // Oil pressure penalties
    if (this.state.oilPressure < 15) score -= 25;
    else if (this.state.oilPressure < 25) score -= 10;

    // Battery penalties
    if (this.state.batteryVoltage < 11.5) score -= 20;
    else if (this.state.batteryVoltage < 12.0) score -= 8;

    // Coolant penalties
    if (this.state.coolantTemperature > 100) score -= 12;

    // RPM penalties
    if (this.state.rpm > 4500) score -= 8;

    // Fuel penalties
    if (this.state.fuelLevel < 10) score -= 10;
    else if (this.state.fuelLevel < 20) score -= 5;

    // Tire penalties
    if (this.state.tirePressure < 29) score -= 5;

    return clamp(score, 0, 100);
  }
}
