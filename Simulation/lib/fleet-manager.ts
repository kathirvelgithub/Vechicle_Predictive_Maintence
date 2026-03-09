import { EnhancedTelemetry } from './telemetry-types';
import { RealisticSimulator } from './realistic-simulator';

export class FleetManager {
  private vehicles: Map<string, RealisticSimulator> = new Map();
  private isRunning: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private onTelemetryUpdate?: (telemetry: EnhancedTelemetry[]) => void;

  constructor(
    private vehicleCount: number = 10,
    private updateIntervalMs: number = 1000
  ) {}

  public initialize() {
    // Create fleet of vehicles with different types
    const vehicleTypes: Array<'sedan' | 'suv' | 'truck' | 'sportsCar' | 'electricVehicle'> = [
      'sedan',
      'suv',
      'truck',
      'sportsCar',
      'electricVehicle',
    ];

    for (let i = 0; i < this.vehicleCount; i++) {
      const vehicleType = vehicleTypes[i % vehicleTypes.length];
      const vehicleId = `VEH-${String(i + 1).padStart(5, '0')}`;
      const simulator = new RealisticSimulator(vehicleType, vehicleId);
      this.vehicles.set(vehicleId, simulator);
    }
  }

  public start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start all vehicle simulators
    this.vehicles.forEach((simulator) => simulator.start());

    // Set up regular updates
    this.updateInterval = setInterval(() => {
      this.update();
    }, this.updateIntervalMs);
  }

  public stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop all vehicle simulators
    this.vehicles.forEach((simulator) => simulator.stop());

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private update() {
    const deltaTime = this.updateIntervalMs / 1000; // Convert to seconds

    // Update all vehicles
    const allTelemetry: EnhancedTelemetry[] = [];
    
    this.vehicles.forEach((simulator) => {
      simulator.update(deltaTime);
      allTelemetry.push(simulator.getTelemetry());
    });

    // Notify listeners
    if (this.onTelemetryUpdate) {
      this.onTelemetryUpdate(allTelemetry);
    }
  }

  public setOnTelemetryUpdate(callback: (telemetry: EnhancedTelemetry[]) => void) {
    this.onTelemetryUpdate = callback;
  }

  public getTelemetryForVehicle(vehicleId: string): EnhancedTelemetry | null {
    const simulator = this.vehicles.get(vehicleId);
    return simulator ? simulator.getTelemetry() : null;
  }

  public getAllTelemetry(): EnhancedTelemetry[] {
    const telemetry: EnhancedTelemetry[] = [];
    this.vehicles.forEach((simulator) => {
      telemetry.push(simulator.getTelemetry());
    });
    return telemetry;
  }

  public getVehicleIds(): string[] {
    return Array.from(this.vehicles.keys());
  }

  public getVehicleCount(): number {
    return this.vehicles.size;
  }

  public isSimulating(): boolean {
    return this.isRunning;
  }
}
