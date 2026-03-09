export interface TelemetryData {
  vehicleId: string;
  engineTemperature: number;
  rpm: number;
  speed: number;
  batteryVoltage: number;
  oilPressure: number;
  fuelLevel: number;
  latitude: number;
  longitude: number;
  timestamp: string;
}

// Simulate fleet movement area (San Francisco area coordinates)
const FLEET_CENTER = { lat: 37.7749, lng: -122.4194 };
const FLEET_RADIUS = 0.1; // Roughly 10km

export function generateVehicleTelemetry(vehicleId: string, baseIndex: number): TelemetryData {
  // Generate realistic but randomized telemetry data
  const time = Date.now();
  const cycle = (time % 60000) / 60000; // 60-second cycle
  
  // Simulate circular motion around fleet center
  const angle = (baseIndex / 100) * Math.PI * 2 + cycle * Math.PI * 2;
  const radius = FLEET_RADIUS * (0.7 + Math.sin(cycle * Math.PI) * 0.3);
  
  return {
    vehicleId,
    // Engine temperature varies between 70-110°C with some randomness
    engineTemperature: 85 + Math.sin(cycle * Math.PI * 2) * 15 + Math.random() * 10 - 5,
    
    // RPM varies based on speed
    rpm: 1200 + Math.sin(cycle * Math.PI * 2) * 2500 + Math.random() * 200,
    
    // Speed in km/h
    speed: 60 + Math.sin(cycle * Math.PI * 2) * 30 + Math.random() * 10,
    
    // Battery voltage 12-14.5V
    batteryVoltage: 13.2 + Math.random() * 0.8 - Math.sin(cycle * Math.PI * 2) * 0.3,
    
    // Oil pressure in bar
    oilPressure: 4 + Math.sin(cycle * Math.PI * 2) * 1.5 + Math.random() * 0.5,
    
    // Fuel level 0-100%
    fuelLevel: Math.max(5, 75 - (cycle * 20) + Math.random() * 15),
    
    // Location with circular motion
    latitude: FLEET_CENTER.lat + radius * Math.cos(angle),
    longitude: FLEET_CENTER.lng + radius * Math.sin(angle),
    
    timestamp: new Date().toISOString(),
  };
}

export function getVehicleHealth(temp: number): 'healthy' | 'warning' | 'critical' {
  if (temp > 105) return 'critical';
  if (temp > 95) return 'warning';
  return 'healthy';
}
