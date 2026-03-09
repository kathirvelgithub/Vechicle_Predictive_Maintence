import { generateVehicleTelemetry, TelemetryData } from './telemetry-generator';

export class FleetSimulator {
  private vehicleCount: number = 100;
  private interval: number = 2000; // 2 seconds
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private apiUrl: string = '/api/telematics';
  private onDataGenerated?: (data: TelemetryData[]) => void;

  constructor(config?: { vehicleCount?: number; interval?: number; apiUrl?: string }) {
    if (config?.vehicleCount) this.vehicleCount = config.vehicleCount;
    if (config?.interval) this.interval = config.interval;
    if (config?.apiUrl) this.apiUrl = config.apiUrl;
  }

  setVehicleCount(count: number) {
    this.vehicleCount = Math.max(1, Math.min(500, count));
  }

  setInterval(ms: number) {
    this.interval = Math.max(500, Math.min(10000, ms));
    
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  setApiUrl(url: string) {
    this.apiUrl = url;
  }

  setOnDataGenerated(callback: (data: TelemetryData[]) => void) {
    this.onDataGenerated = callback;
  }

  private async sendTelemetryData(data: TelemetryData[]) {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        console.error('Failed to send telemetry data:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending telemetry data:', error);
    }
  }

  private tick = async () => {
    const telemetryData: TelemetryData[] = [];

    for (let i = 0; i < this.vehicleCount; i++) {
      const vehicleId = `VEH-${String(i + 1).padStart(5, '0')}`;
      const data = generateVehicleTelemetry(vehicleId, i);
      telemetryData.push(data);
    }

    // Send to API
    await this.sendTelemetryData(telemetryData);

    // Notify listeners
    if (this.onDataGenerated) {
      this.onDataGenerated(telemetryData);
    }
  };

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    // Send initial data immediately
    this.tick();
    // Then set up regular intervals
    this.intervalId = setInterval(() => this.tick(), this.interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  isSimulating(): boolean {
    return this.isRunning;
  }

  getVehicleCount(): number {
    return this.vehicleCount;
  }

  getInterval(): number {
    return this.interval;
  }
}

export const createFleetSimulator = (config?: any) => {
  return new FleetSimulator(config);
};
