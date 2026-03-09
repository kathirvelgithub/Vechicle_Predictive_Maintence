import { EnhancedTelemetry, VehicleProfile } from './telemetry-types';

export class RealisticSimulator {
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
  private position: { lat: number; lng: number } = { lat: 37.7749, lng: -122.4194 };
  private heading: number = 0;
  
  // Wear simulation
  private engineWear: number = 100;
  private transmissionWear: number = 100;
  private brakeWear: number = 100;
  private tireWear: number = 100;
  private batteryHealth: number = 100;
  private coolingSystemHealth: number = 100;
  private exhaustSystemHealth: number = 100;
  private suspensionHealth: number = 100;
  
  // Cumulative stats
  private totalDistance: number = 0;
  private totalOperatingTime: number = 0;
  private totalIdleTime: number = 0;
  private totalFuelUsed: number = 0;

  constructor(vehicleType: VehicleProfile['type'] = 'sedan', vehicleId?: string) {
    this.vehicleId = vehicleId || `VEH-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    this.profile = this.getVehicleProfile(vehicleType);
    this.telemetry = this.initializeTelemetry();
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
    this.totalOperatingTime += deltaTime / 3600; // Convert to hours

    // Simulate realistic driving behavior
    this.simulateDrivingBehavior(deltaTime);
    
    // Update physics
    this.updatePhysics(deltaTime);
    
    // Update wear and tear
    this.updateWearAndTear(deltaTime);
    
    // Generate anomalies occasionally
    this.simulateAnomalies();
    
    // Update telemetry
    this.updateTelemetry();
  }

  private simulateDrivingBehavior(deltaTime: number) {
    const cycle = (this.simulationTime % 120) / 120; // 2-minute cycle
    
    // Realistic throttle pattern
    if (cycle < 0.3) {
      // Acceleration phase
      this.throttle = Math.min(100, this.throttle + 30 * deltaTime);
    } else if (cycle < 0.6) {
      // Cruising phase
      this.throttle = 30 + Math.sin(this.simulationTime * 0.5) * 10;
    } else if (cycle < 0.7) {
      // Deceleration phase
      this.throttle = Math.max(0, this.throttle - 50 * deltaTime);
      this.brake = Math.min(100, this.brake + 40 * deltaTime);
    } else {
      // Stop/idle phase
      this.throttle = 0;
      this.brake = 100;
    }
    
    // Release brake when accelerating
    if (this.throttle > 10) {
      this.brake = Math.max(0, this.brake - 100 * deltaTime);
    }
  }

  private updatePhysics(deltaTime: number) {
    // Calculate target speed based on throttle
    const targetSpeed = (this.throttle / 100) * this.profile.maxSpeed;
    
    // Apply acceleration/deceleration
    const acceleration = this.brake > 50 
      ? -5 // Braking deceleration
      : (targetSpeed - this.currentSpeed) * 0.5; // Smooth acceleration
    
    this.currentSpeed = Math.max(0, this.currentSpeed + acceleration * deltaTime);
    
    // Update RPM based on speed and gear
    this.currentGear = this.calculateGear();
    this.currentRPM = this.currentGear === 0 
      ? 800 // Idle RPM
      : 800 + (this.currentSpeed / this.profile.maxSpeed) * (this.profile.maxRPM - 800);
    
    // Update position
    const speedMs = this.currentSpeed / 3.6; // km/h to m/s
    const distanceM = speedMs * deltaTime;
    this.totalDistance += distanceM / 1000; // Convert to km
    
    // Update heading and position (simulate circular motion)
    this.heading = (this.heading + deltaTime * 10) % 360;
    const headingRad = (this.heading * Math.PI) / 180;
    this.position.lat += (distanceM / 111320) * Math.cos(headingRad);
    this.position.lng += (distanceM / (111320 * Math.cos(this.position.lat * Math.PI / 180))) * Math.sin(headingRad);
    
    // Track idle time
    if (this.currentSpeed < 1 && this.currentRPM < 1000) {
      this.totalIdleTime += deltaTime / 3600;
    }
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
    // Wear rates (per hour of operation)
    const wearRates = {
      engine: 0.001,
      transmission: 0.0008,
      brakes: 0.002,
      tires: 0.0015,
      battery: 0.0005,
      cooling: 0.0007,
      exhaust: 0.0006,
      suspension: 0.0009,
    };
    
    // Accelerated wear under harsh conditions
    const harshFactor = (this.telemetry.harshAcceleration || this.telemetry.harshBraking) ? 2 : 1;
    
    this.engineWear = Math.max(0, this.engineWear - wearRates.engine * (deltaTime / 3600) * harshFactor);
    this.transmissionWear = Math.max(0, this.transmissionWear - wearRates.transmission * (deltaTime / 3600));
    this.brakeWear = Math.max(0, this.brakeWear - wearRates.brakes * (deltaTime / 3600) * (this.brake > 50 ? 2 : 1));
    this.tireWear = Math.max(0, this.tireWear - wearRates.tires * (deltaTime / 3600));
    this.batteryHealth = Math.max(0, this.batteryHealth - wearRates.battery * (deltaTime / 3600));
    this.coolingSystemHealth = Math.max(0, this.coolingSystemHealth - wearRates.cooling * (deltaTime / 3600));
    this.exhaustSystemHealth = Math.max(0, this.exhaustSystemHealth - wearRates.exhaust * (deltaTime / 3600));
    this.suspensionHealth = Math.max(0, this.suspensionHealth - wearRates.suspension * (deltaTime / 3600));
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
    const acceleration = this.throttle > 50 ? (this.throttle - 50) / 10 : 0;
    
    this.telemetry = {
      ...this.telemetry,
      timestamp: new Date().toISOString(),
      
      speed: this.currentSpeed,
      rpm: this.currentRPM,
      engineTemperature: 70 + (this.currentRPM / this.profile.maxRPM) * 30 + Math.random() * 5,
      fuelLevel: Math.max(0, this.telemetry.fuelLevel - (this.throttle / 100) * 0.01),
      
      engineTorque: (this.currentRPM / this.profile.maxRPM) * 300 * (this.throttle / 100),
      enginePower: (this.currentRPM / this.profile.maxRPM) * 400 * (this.throttle / 100),
      oilPressure: 30 + (this.currentRPM / this.profile.maxRPM) * 40,
      coolantTemp: 70 + (this.currentRPM / this.profile.maxRPM) * 20,
      
      gear: this.currentGear,
      acceleration: acceleration,
      throttlePosition: this.throttle,
      brakePosition: this.brake,
      
      batteryVoltage: 12.6 + (this.currentRPM / this.profile.maxRPM) * 1.8,
      batteryCharge: this.batteryHealth,
      alternatorLoad: 20 + (this.currentRPM / this.profile.maxRPM) * 60,
      
      tirePressureFrontLeft: 32 + Math.random() * 2 - 1,
      tirePressureFrontRight: 32 + Math.random() * 2 - 1,
      tirePressureRearLeft: 32 + Math.random() * 2 - 1,
      tirePressureRearRight: 32 + Math.random() * 2 - 1,
      tireTemperatureFrontLeft: 20 + this.currentSpeed * 0.3,
      tireTemperatureFrontRight: 20 + this.currentSpeed * 0.3,
      tireTemperatureRearLeft: 20 + this.currentSpeed * 0.3,
      tireTemperatureRearRight: 20 + this.currentSpeed * 0.3,
      
      brakePadWearFront: this.brakeWear,
      brakePadWearRear: this.brakeWear * 0.7,
      brakeFluidLevel: 100 - (100 - this.brakeWear) * 0.1,
      
      transmissionTemp: 30 + (this.currentRPM / this.profile.maxRPM) * 50,
      transmissionFluidLevel: this.transmissionWear,
      
      latitude: this.position.lat,
      longitude: this.position.lng,
      altitude: 10 + Math.random() * 20,
      heading: this.heading,
      
      harshBraking: this.brake > 80 && this.currentSpeed > 40,
      harshAcceleration: acceleration > 3,
      harshCornering: false,
      drivingScore: this.calculateDrivingScore(),
      ecoScore: this.calculateEcoScore(),
      
      componentHealth: {
        engine: this.engineWear,
        transmission: this.transmissionWear,
        brakes: this.brakeWear,
        tires: this.tireWear,
        battery: this.batteryHealth,
        cooling: this.coolingSystemHealth,
        exhaust: this.exhaustSystemHealth,
        suspension: this.suspensionHealth,
      },
      
      totalOperatingHours: this.totalOperatingTime,
      totalDistanceKm: this.totalDistance,
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
