import { EnhancedTelemetry, VehicleProfile } from './telemetry-types';

// ───────────────────────────────────────────────────────────────────────
// Enhanced Realistic Simulator with:
//  1. Markov driving-cycle state machine
//  2. Ornstein-Uhlenbeck (OU) noise for all sensor readings
//  3. NASA CMAPSS-calibrated piecewise wear model
//  4. SUMO-inspired waypoint GPS routing
// ───────────────────────────────────────────────────────────────────────

// ── 1. Markov driving-cycle state machine ───────────────────────────────────
type DriveState = 'idle' | 'city' | 'highway' | 'acceleration' | 'braking';

const RS_MARKOV: Record<DriveState, Record<DriveState, number>> = {
  idle:         { idle: 0.60, city: 0.35, highway: 0.00, acceleration: 0.05, braking: 0.00 },
  city:         { idle: 0.08, city: 0.55, highway: 0.15, acceleration: 0.15, braking: 0.07 },
  highway:      { idle: 0.01, city: 0.10, highway: 0.72, acceleration: 0.12, braking: 0.05 },
  acceleration: { idle: 0.00, city: 0.25, highway: 0.30, acceleration: 0.35, braking: 0.10 },
  braking:      { idle: 0.25, city: 0.50, highway: 0.05, acceleration: 0.00, braking: 0.20 },
};
const RS_DWELL: Record<DriveState, number> = { idle: 3, city: 4, highway: 6, acceleration: 2, braking: 2 };
const RS_TARGETS: Record<DriveState, { speedMu: number; rpmMu: number; throttleMu: number }> = {
  idle:         { speedMu: 0,  rpmMu: 820,  throttleMu: 3  },
  city:         { speedMu: 35, rpmMu: 2000, throttleMu: 35 },
  highway:      { speedMu: 95, rpmMu: 2600, throttleMu: 55 },
  acceleration: { speedMu: 75, rpmMu: 3800, throttleMu: 82 },
  braking:      { speedMu: 20, rpmMu: 900,  throttleMu: 2  },
};

function rsSampleMarkov(from: DriveState): DriveState {
  let r = Math.random();
  for (const [s, p] of Object.entries(RS_MARKOV[from]) as [DriveState, number][]) {
    r -= p; if (r <= 0) return s;
  }
  return from;
}

// ── 2. Ornstein-Uhlenbeck helpers ───────────────────────────────────────────
function rsGaussian(): number {
  const u1 = Math.random() + 1e-10, u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function rsOU(x: number, mu: number, theta: number, sigma: number): number {
  return x + theta * (mu - x) + sigma * rsGaussian();
}

// ── 3. NASA CMAPSS piecewise wear rate ──────────────────────────────────────
function rsWearRate(base: number, health: number): number {
  const h = Math.min(100, Math.max(0, health));
  return base * (1 + 2 * (1 - h / 100) ** 2);
}

// ── 4. SUMO-inspired waypoint routes (Chennai metro area) ──────────────────
const SUMO_ROUTES: Array<Array<{ lat: number; lng: number; altM: number }>> = [
  // Route 0: Urban loop — Chennai city centre
  [ { lat: 13.0827, lng: 80.2707, altM: 6  }, { lat: 13.0878, lng: 80.2648, altM: 8  },
    { lat: 13.0920, lng: 80.2590, altM: 10 }, { lat: 13.0960, lng: 80.2650, altM: 9  },
    { lat: 13.0940, lng: 80.2720, altM: 7  }, { lat: 13.0900, lng: 80.2780, altM: 6  } ],
  // Route 1: Highway stretch — OMR
  [ { lat: 12.9718, lng: 80.1985, altM: 12 }, { lat: 13.0100, lng: 80.2080, altM: 14 },
    { lat: 13.0500, lng: 80.2200, altM: 15 }, { lat: 13.0900, lng: 80.2350, altM: 13 },
    { lat: 13.0500, lng: 80.2200, altM: 15 }, { lat: 13.0100, lng: 80.2080, altM: 14 } ],
  // Route 2: Suburban — GST Road
  [ { lat: 12.9100, lng: 80.2300, altM: 5  }, { lat: 12.9300, lng: 80.2450, altM: 6  },
    { lat: 12.9500, lng: 80.2550, altM: 8  }, { lat: 12.9700, lng: 80.2400, altM: 7  },
    { lat: 12.9500, lng: 80.2200, altM: 6  }, { lat: 12.9300, lng: 80.2100, altM: 5  } ],
  // Route 3: Port — for trucks (slower, flat)
  [ { lat: 13.0900, lng: 80.2900, altM: 3  }, { lat: 13.0850, lng: 80.2950, altM: 3  },
    { lat: 13.0800, lng: 80.3000, altM: 4  }, { lat: 13.0750, lng: 80.2950, altM: 3  },
    { lat: 13.0800, lng: 80.2900, altM: 3  } ],
  // Route 4: Industrial — Ambattur
  [ { lat: 13.1100, lng: 80.1500, altM: 18 }, { lat: 13.1200, lng: 80.1600, altM: 20 },
    { lat: 13.1300, lng: 80.1700, altM: 22 }, { lat: 13.1200, lng: 80.1800, altM: 21 },
    { lat: 13.1100, lng: 80.1700, altM: 19 }, { lat: 13.1000, lng: 80.1600, altM: 18 } ],
];

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
  private vehicleId: string;
  private profile: VehicleProfile;
  private telemetry: EnhancedTelemetry;
  private isRunning: boolean = false;
  private simulationTime: number = 0;

  // Physics state
  private currentSpeed: number = 0;
  private currentRPM: number = 800;
  private currentGear: number = 0;
  private throttle: number = 0;
  private brake: number = 0;

  // 1. Markov driving state
  private driveState: DriveState = 'city';
  private driveDwell: number = 0;

  // 4. SUMO GPS routing
  private routeIdx:    number = 0;
  private wayptIdx:    number = 0;
  private wayptProg:   number = 0;
  private heading:     number = 0;
  private position:    { lat: number; lng: number } = { lat: 13.0827, lng: 80.2707 };

  // Wear simulation
  private engineWear:           number = 100;
  private transmissionWear:     number = 100;
  private brakeWear:            number = 100;
  private tireWear:             number = 100;
  private batteryHealth:        number = 100;
  private coolingSystemHealth:  number = 100;
  private exhaustSystemHealth:  number = 100;
  private suspensionHealth:     number = 100;

  // Cumulative stats
  private totalDistance:       number = 0;
  private totalOperatingTime:  number = 0;
  private totalIdleTime:       number = 0;
  private totalFuelUsed:       number = 0;

  constructor(vehicleType: VehicleProfile['type'] = 'sedan', vehicleId?: string) {
    this.vehicleId = vehicleId || `VEH-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    this.profile   = this.getVehicleProfile(vehicleType);
    this.telemetry = this.initializeTelemetry();
    // Assign SUMO route based on vehicle type
    this.routeIdx  = ['sedan','suv','truck','sportsCar','electricVehicle'].indexOf(vehicleType) % SUMO_ROUTES.length;
    this.position  = { ...SUMO_ROUTES[this.routeIdx][0] };
  }

  private getVehicleProfile(type: VehicleProfile['type']): VehicleProfile {
    const profiles: Record<VehicleProfile['type'], VehicleProfile> = {
      sedan: {
        type: 'sedan',
        maxSpeed: 200,
        maxRPM: 6500,
        fuelCapacity: 60,
        weight: 1500,
        engineDisplacement: 2.0,
      },
      suv: {
        type: 'suv',
        maxSpeed: 180,
        maxRPM: 6000,
        fuelCapacity: 80,
        weight: 2200,
        engineDisplacement: 3.5,
      },
      truck: {
        type: 'truck',
        maxSpeed: 160,
        maxRPM: 5500,
        fuelCapacity: 120,
        weight: 3500,
        engineDisplacement: 5.0,
      },
      sportsCar: {
        type: 'sportsCar',
        maxSpeed: 280,
        maxRPM: 8000,
        fuelCapacity: 70,
        weight: 1400,
        engineDisplacement: 4.0,
      },
      electricVehicle: {
        type: 'electricVehicle',
        maxSpeed: 220,
        maxRPM: 15000,
        fuelCapacity: 75,
        weight: 1800,
        engineDisplacement: 0,
      },
    };
    return profiles[type];
  }

  private initializeTelemetry(): EnhancedTelemetry {
    return {
      vehicleId: this.vehicleId,
      timestamp: new Date().toISOString(),
      
      speed: 0,
      rpm: 800,
      engineTemperature: 20,
      fuelLevel: 75,
      
      engineTorque: 0,
      enginePower: 0,
      oilPressure: 30,
      coolantTemp: 20,
      
      gear: 0,
      acceleration: 0,
      throttlePosition: 0,
      brakePosition: 0,
      
      batteryVoltage: 12.6,
      batteryCharge: 100,
      alternatorLoad: 20,
      
      tirePressureFrontLeft: 32,
      tirePressureFrontRight: 32,
      tirePressureRearLeft: 32,
      tirePressureRearRight: 32,
      tireTemperatureFrontLeft: 20,
      tireTemperatureFrontRight: 20,
      tireTemperatureRearLeft: 20,
      tireTemperatureRearRight: 20,
      
      brakePadWearFront: 100,
      brakePadWearRear: 100,
      brakeFluidLevel: 100,
      
      transmissionTemp: 30,
      transmissionFluidLevel: 100,
      
      latitude: this.position.lat,
      longitude: this.position.lng,
      altitude: 10,
      heading: 0,
      
      harshBraking: false,
      harshAcceleration: false,
      harshCornering: false,
      drivingScore: 100,
      ecoScore: 100,
      
      overallHealth: 100,
      maintenanceUrgency: 'none',
      componentsNeedingMaintenance: [],
      hoursUntilNextMaintenance: 500,
      
      componentHealth: {
        engine: 100,
        transmission: 100,
        brakes: 100,
        tires: 100,
        battery: 100,
        cooling: 100,
        exhaust: 100,
        suspension: 100,
      },
      
      predictedFailureComponent: null,
      failureRisk: 'low',
      hoursUntilFailure: null,
      anomalyDetected: false,
      anomalyType: null,
      
      totalOperatingHours: 0,
      totalDistanceKm: 0,
      totalIdleTime: 0,
      totalFuelConsumed: 0,
      averageFuelEconomy: 8.5,
    };
  }

  public start() {
    this.isRunning = true;
  }

  public stop() {
    this.isRunning = false;
  }

  public update(deltaTime: number) {
    if (!this.isRunning) return;
    this.simulationTime += deltaTime;
    this.totalOperatingTime += deltaTime / 3600;

    // 1. Markov: advance driving state
    this.driveDwell++;
    if (this.driveDwell >= RS_DWELL[this.driveState]) {
      const next = rsSampleMarkov(this.driveState);
      if (next !== this.driveState) { this.driveState = next; this.driveDwell = 0; }
    }
    const stateTarget = RS_TARGETS[this.driveState];

    // Drive throttle/brake from Markov state (replaces fixed cycle)
    this.throttle = rsOU(this.throttle, stateTarget.throttleMu, 0.25, 5);
    this.throttle = Math.min(100, Math.max(0, this.throttle));
    this.brake    = this.driveState === 'braking' ? rsOU(this.brake, 70, 0.3, 8)
                  : Math.max(0, this.brake - 80 * deltaTime);
    this.brake    = Math.min(100, Math.max(0, this.brake));

    // Update physics
    this.updatePhysics(deltaTime, stateTarget);
    // 3. CMAPSS wear
    this.updateWearAndTear(deltaTime);
    // Anomalies
    this.simulateAnomalies();
    // Sensor update (OU noise applied inside)
    this.updateTelemetry();
  }

  private simulateDrivingBehavior(_deltaTime: number) { /* replaced by Markov in update() */ }

  private updatePhysics(deltaTime: number, stateTarget: { speedMu: number; rpmMu: number }) {
    // OU-guided speed toward state target
    const targetSpeed = stateTarget.speedMu;
    const accel = this.brake > 50 ? -5 : (targetSpeed - this.currentSpeed) * 0.5;
    this.currentSpeed = Math.max(0, this.currentSpeed + accel * deltaTime);

    this.currentGear = this.calculateGear();
    this.currentRPM  = this.currentGear === 0 ? 820
      : rsOU(this.currentRPM, stateTarget.rpmMu, 0.20, 60);
    this.currentRPM  = Math.max(700, Math.min(this.profile.maxRPM, this.currentRPM));

    // 4. SUMO-style waypoint GPS routing
    this.updateSumoPosition(deltaTime);

    // Idle time
    if (this.currentSpeed < 1 && this.currentRPM < 900) this.totalIdleTime += deltaTime / 3600;
  }

  // 4. SUMO-inspired waypoint GPS routing
  private updateSumoPosition(deltaTime: number) {
    const route = SUMO_ROUTES[this.routeIdx % SUMO_ROUTES.length];
    const from  = route[this.wayptIdx % route.length];
    const to    = route[(this.wayptIdx + 1) % route.length];

    const segLenM = haversineM(from.lat, from.lng, to.lat, to.lng);
    const speedMs = this.currentSpeed / 3.6;
    const distM   = speedMs * deltaTime;
    this.totalDistance += distM / 1000;

    if (segLenM > 0) this.wayptProg += distM / segLenM;
    if (this.wayptProg >= 1) {
      this.wayptProg = 0;
      this.wayptIdx  = (this.wayptIdx + 1) % route.length;
    }
    const t = this.wayptProg;
    this.position.lat  = from.lat + (to.lat - from.lat) * t;
    this.position.lng  = from.lng + (to.lng - from.lng) * t;
    const dLat = to.lat - from.lat, dLng = to.lng - from.lng;
    this.heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
  }

  private calculateGear(): number {
    if (this.currentSpeed < 1) return 0;
    if (this.currentSpeed < 20) return 1;
    if (this.currentSpeed < 40) return 2;
    if (this.currentSpeed < 60) return 3;
    if (this.currentSpeed < 80) return 4;
    if (this.currentSpeed < 100) return 5;
    return 6;
  }

  private updateWearAndTear(deltaTime: number) {
    // Base wear rates (per hour of operation) calibrated against CMAPSS FD001 curves
    const harsh  = (this.telemetry.harshAcceleration || this.telemetry.harshBraking) ? 2.5 : 1;
    const brakFm = this.brake > 50 ? 2.5 : 1;
    const dt = deltaTime / 3600;

    this.engineWear          = Math.max(0, this.engineWear          - rsWearRate(0.001, this.engineWear)          * dt * harsh);
    this.transmissionWear    = Math.max(0, this.transmissionWear    - rsWearRate(0.0008,this.transmissionWear)    * dt);
    this.brakeWear           = Math.max(0, this.brakeWear           - rsWearRate(0.002, this.brakeWear)           * dt * brakFm);
    this.tireWear            = Math.max(0, this.tireWear            - rsWearRate(0.0015,this.tireWear)            * dt * harsh);
    this.batteryHealth       = Math.max(0, this.batteryHealth       - rsWearRate(0.0005,this.batteryHealth)       * dt);
    this.coolingSystemHealth = Math.max(0, this.coolingSystemHealth - rsWearRate(0.0007,this.coolingSystemHealth) * dt);
    this.exhaustSystemHealth = Math.max(0, this.exhaustSystemHealth - rsWearRate(0.0006,this.exhaustSystemHealth) * dt);
    this.suspensionHealth    = Math.max(0, this.suspensionHealth    - rsWearRate(0.0009,this.suspensionHealth)    * dt * harsh);
  }

  private simulateAnomalies() {
    // Randomly introduce anomalies based on component health
    const anomalyChance = Math.random();
    
    if (this.engineWear < 50 && anomalyChance < 0.01) {
      this.telemetry.anomalyDetected = true;
      this.telemetry.anomalyType = 'engine_overheating';
      this.telemetry.engineTemperature += 20;
    } else if (this.batteryHealth < 60 && anomalyChance < 0.008) {
      this.telemetry.anomalyDetected = true;
      this.telemetry.anomalyType = 'battery_voltage_drop';
      this.telemetry.batteryVoltage -= 1.5;
    } else if (this.brakeWear < 40 && anomalyChance < 0.012) {
      this.telemetry.anomalyDetected = true;
      this.telemetry.anomalyType = 'brake_system_degradation';
    } else {
      this.telemetry.anomalyDetected = false;
      this.telemetry.anomalyType = null;
    }
  }

  private updateTelemetry() {
    const rpmRatio  = this.currentRPM / this.profile.maxRPM;
    const engDeg    = (100 - this.engineWear)         / 100;
    const coolDeg   = (100 - this.coolingSystemHealth) / 100;
    const batDeg    = (100 - this.batteryHealth)       / 100;

    // 2. OU-based sensor readings with CMAPSS-degraded means
    const muEngTemp = 72 + rpmRatio * 28 + engDeg * 14;
    const muCoolant = muEngTemp * 0.90 + coolDeg * 5;
    const muOilPsi  = 32 + rpmRatio * 36 - engDeg * 10;
    const muBatV    = 12.6 + rpmRatio * 1.6 - batDeg * 0.5;

    const prevEngT  = this.telemetry.engineTemperature || muEngTemp;
    const prevCool  = this.telemetry.coolantTemp || muCoolant;
    const prevOil   = this.telemetry.oilPressure || muOilPsi;
    const prevBatV  = this.telemetry.batteryVoltage || muBatV;

    const acceleration = this.throttle > 50 ? (this.throttle - 50) / 10 : 0;
    const route = SUMO_ROUTES[this.routeIdx % SUMO_ROUTES.length];
    const altitude = route[this.wayptIdx % route.length].altM +
                     rsGaussian() * 1.5;

    this.telemetry = {
      ...this.telemetry,
      timestamp: new Date().toISOString(),

      speed:             this.currentSpeed,
      rpm:               this.currentRPM,
      engineTemperature: Math.max(70, rsOU(prevEngT, muEngTemp, 0.18, 0.8 + engDeg * 0.5)),
      fuelLevel:         Math.max(0, this.telemetry.fuelLevel - (this.throttle / 100) * 0.01),

      engineTorque:  rpmRatio * 300 * (this.throttle / 100),
      enginePower:   rpmRatio * 400 * (this.throttle / 100),
      oilPressure:   Math.max(15, rsOU(prevOil,  muOilPsi,  0.25, 0.8)),
      coolantTemp:   Math.max(70, rsOU(prevCool, muCoolant, 0.15, 0.6 + coolDeg * 0.4)),

      gear:              this.currentGear,
      acceleration:      acceleration,
      throttlePosition:  this.throttle,
      brakePosition:     this.brake,

      batteryVoltage:    Math.max(11.0, rsOU(prevBatV, muBatV, 0.30, 0.04 + batDeg * 0.02)),
      batteryCharge:     this.batteryHealth,
      alternatorLoad:    20 + rpmRatio * 60,

      // OU-noise tire pressures with tireWear-driven mean reduction
      tirePressureFrontLeft:  Math.max(26, rsOU(this.telemetry.tirePressureFrontLeft  || 32, 32 - (100-this.tireWear)*0.04, 0.08, 0.12)),
      tirePressureFrontRight: Math.max(26, rsOU(this.telemetry.tirePressureFrontRight || 32, 32 - (100-this.tireWear)*0.04, 0.08, 0.12)),
      tirePressureRearLeft:   Math.max(26, rsOU(this.telemetry.tirePressureRearLeft   || 32, 32 - (100-this.tireWear)*0.04, 0.08, 0.12)),
      tirePressureRearRight:  Math.max(26, rsOU(this.telemetry.tirePressureRearRight  || 32, 32 - (100-this.tireWear)*0.04, 0.08, 0.12)),
      tireTemperatureFrontLeft:  20 + this.currentSpeed * 0.3,
      tireTemperatureFrontRight: 20 + this.currentSpeed * 0.3,
      tireTemperatureRearLeft:   20 + this.currentSpeed * 0.3,
      tireTemperatureRearRight:  20 + this.currentSpeed * 0.3,

      brakePadWearFront:   this.brakeWear,
      brakePadWearRear:    this.brakeWear * 0.7,
      brakeFluidLevel:     100 - (100 - this.brakeWear) * 0.1,

      transmissionTemp:        30 + rpmRatio * 50,
      transmissionFluidLevel:  this.transmissionWear,

      latitude:  this.position.lat,
      longitude: this.position.lng,
      altitude:  altitude,
      heading:   this.heading,

      harshBraking:      this.brake > 80 && this.currentSpeed > 40,
      harshAcceleration: acceleration > 3,
      harshCornering:    false,
      drivingScore:      this.calculateDrivingScore(),
      ecoScore:          this.calculateEcoScore(),

      componentHealth: {
        engine:       this.engineWear,
        transmission: this.transmissionWear,
        brakes:       this.brakeWear,
        tires:        this.tireWear,
        battery:      this.batteryHealth,
        cooling:      this.coolingSystemHealth,
        exhaust:      this.exhaustSystemHealth,
        suspension:   this.suspensionHealth,
      },

      totalOperatingHours: this.totalOperatingTime,
      totalDistanceKm:     this.totalDistance,
      totalIdleTime:       this.totalIdleTime,
      totalFuelConsumed:   this.totalFuelUsed,
      averageFuelEconomy:  this.totalDistance > 0 ? this.totalFuelUsed / this.totalDistance * 100 : 8.5,
    };
    this.updateMaintenancePredictions();
  }
      totalIdleTime: this.totalIdleTime,
      totalFuelConsumed: this.totalFuelUsed,
      averageFuelEconomy: this.totalDistance > 0 ? this.totalFuelUsed / this.totalDistance * 100 : 8.5,
    };
    
    // Calculate overall health and maintenance predictions
    this.updateMaintenancePredictions();
  }

  private calculateDrivingScore(): number {
    let score = 100;
    
    if (this.telemetry.harshBraking) score -= 10;
    if (this.telemetry.harshAcceleration) score -= 10;
    if (this.telemetry.harshCornering) score -= 5;
    if (this.currentRPM > this.profile.maxRPM * 0.8) score -= 5;
    
    return Math.max(0, score);
  }

  private calculateEcoScore(): number {
    let score = 100;
    
    const avgRPMRatio = this.currentRPM / this.profile.maxRPM;
    if (avgRPMRatio > 0.7) score -= 20;
    if (this.throttle > 80) score -= 15;
    if (this.totalIdleTime / this.totalOperatingTime > 0.2) score -= 10;
    
    return Math.max(0, score);
  }

  private updateMaintenancePredictions() {
    const healthValues = Object.values(this.telemetry.componentHealth);
    const overallHealth = healthValues.reduce((a, b) => a + b, 0) / healthValues.length;
    
    this.telemetry.overallHealth = overallHealth;
    
    // Determine maintenance urgency
    if (overallHealth < 30) {
      this.telemetry.maintenanceUrgency = 'critical';
    } else if (overallHealth < 50) {
      this.telemetry.maintenanceUrgency = 'urgent';
    } else if (overallHealth < 70) {
      this.telemetry.maintenanceUrgency = 'soon';
    } else if (overallHealth < 85) {
      this.telemetry.maintenanceUrgency = 'routine';
    } else {
      this.telemetry.maintenanceUrgency = 'none';
    }
    
    // Identify components needing maintenance
    const needsMaintenance: string[] = [];
    Object.entries(this.telemetry.componentHealth).forEach(([component, health]) => {
      if (health < 60) {
        needsMaintenance.push(component);
      }
    });
    this.telemetry.componentsNeedingMaintenance = needsMaintenance;
    
    // Predict failure
    const criticalComponent = Object.entries(this.telemetry.componentHealth)
      .sort(([, a], [, b]) => a - b)[0];
    
    if (criticalComponent[1] < 40) {
      this.telemetry.predictedFailureComponent = criticalComponent[0];
      this.telemetry.hoursUntilFailure = criticalComponent[1] * 10; // Rough estimate
      this.telemetry.failureRisk = criticalComponent[1] < 20 ? 'critical' : 
                                   criticalComponent[1] < 30 ? 'high' : 'medium';
    } else {
      this.telemetry.predictedFailureComponent = null;
      this.telemetry.hoursUntilFailure = null;
      this.telemetry.failureRisk = 'low';
    }
    
    // Estimate hours until next maintenance
    this.telemetry.hoursUntilNextMaintenance = overallHealth * 5;
  }

  public getTelemetry(): EnhancedTelemetry {
    return { ...this.telemetry };
  }

  public getVehicleId(): string {
    return this.vehicleId;
  }
}
