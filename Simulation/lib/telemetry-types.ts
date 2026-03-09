export interface EnhancedTelemetry {
  vehicleId: string;
  timestamp: string;
  
  // Basic metrics
  speed: number;
  rpm: number;
  engineTemperature: number;
  fuelLevel: number;
  
  // Engine metrics
  engineTorque: number;
  enginePower: number;
  oilPressure: number;
  coolantTemp: number;
  
  // Performance metrics
  gear: number;
  acceleration: number;
  throttlePosition: number;
  brakePosition: number;
  
  // Battery & Electrical
  batteryVoltage: number;
  batteryCharge: number;
  alternatorLoad: number;
  
  // Tire metrics
  tirePressureFrontLeft: number;
  tirePressureFrontRight: number;
  tirePressureRearLeft: number;
  tirePressureRearRight: number;
  tireTemperatureFrontLeft: number;
  tireTemperatureFrontRight: number;
  tireTemperatureRearLeft: number;
  tireTemperatureRearRight: number;
  
  // Brake metrics
  brakePadWearFront: number;
  brakePadWearRear: number;
  brakeFluidLevel: number;
  
  // Transmission
  transmissionTemp: number;
  transmissionFluidLevel: number;
  
  // Location
  latitude: number;
  longitude: number;
  altitude: number;
  heading: number;
  
  // Driving behavior
  harshBraking: boolean;
  harshAcceleration: boolean;
  harshCornering: boolean;
  drivingScore: number;
  ecoScore: number;
  
  // Maintenance prediction
  overallHealth: number;
  maintenanceUrgency: 'none' | 'routine' | 'soon' | 'urgent' | 'critical';
  componentsNeedingMaintenance: string[];
  hoursUntilNextMaintenance: number;
  
  // Component health (0-100%)
  componentHealth: {
    engine: number;
    transmission: number;
    brakes: number;
    tires: number;
    battery: number;
    cooling: number;
    exhaust: number;
    suspension: number;
  };
  
  // AI Predictive Maintenance
  predictedFailureComponent: string | null;
  failureRisk: 'low' | 'medium' | 'high' | 'critical';
  hoursUntilFailure: number | null;
  anomalyDetected: boolean;
  anomalyType: string | null;
  
  // Cumulative statistics
  totalOperatingHours: number;
  totalDistanceKm: number;
  totalIdleTime: number;
  totalFuelConsumed: number;
  averageFuelEconomy: number;
}

export interface VehicleProfile {
  type: 'sedan' | 'suv' | 'truck' | 'sportsCar' | 'electricVehicle';
  maxSpeed: number;
  maxRPM: number;
  fuelCapacity: number;
  weight: number;
  engineDisplacement: number;
}

export interface MaintenanceAlert {
  id: string;
  vehicleId: string;
  component: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  predictedDate: string;
  confidence: number;
  timestamp: string;
}
