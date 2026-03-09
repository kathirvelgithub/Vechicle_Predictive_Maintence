import { EnhancedTelemetry } from './telemetry-types';

export interface PredictiveInsight {
  component: string;
  currentHealth: number;
  predictedFailureDate: string;
  confidence: number;
  recommendation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class PredictiveMaintenanceEngine {
  private historicalData: Map<string, EnhancedTelemetry[]> = new Map();
  private readonly MAX_HISTORY = 100;

  public analyzeTelemetry(telemetry: EnhancedTelemetry): PredictiveInsight[] {
    // Store historical data
    const vehicleHistory = this.historicalData.get(telemetry.vehicleId) || [];
    vehicleHistory.push(telemetry);
    
    if (vehicleHistory.length > this.MAX_HISTORY) {
      vehicleHistory.shift(); // Remove oldest
    }
    
    this.historicalData.set(telemetry.vehicleId, vehicleHistory);

    const insights: PredictiveInsight[] = [];

    // Analyze each component
    Object.entries(telemetry.componentHealth).forEach(([component, health]) => {
      const insight = this.predictComponentFailure(
        component,
        health,
        vehicleHistory,
        telemetry
      );
      
      if (insight) {
        insights.push(insight);
      }
    });

    return insights;
  }

  private predictComponentFailure(
    component: string,
    currentHealth: number,
    history: EnhancedTelemetry[],
    currentTelemetry: EnhancedTelemetry
  ): PredictiveInsight | null {
    // Calculate degradation rate
    const degradationRate = this.calculateDegradationRate(component, history);
    
    // Predict failure based on current health and degradation
    if (currentHealth < 70 || degradationRate > 0.5) {
      const daysUntilFailure = currentHealth / Math.max(degradationRate, 0.1);
      const failureDate = new Date();
      failureDate.setDate(failureDate.getDate() + Math.floor(daysUntilFailure));

      let severity: 'low' | 'medium' | 'high' | 'critical';
      let confidence: number;

      if (currentHealth < 30) {
        severity = 'critical';
        confidence = 0.95;
      } else if (currentHealth < 50) {
        severity = 'high';
        confidence = 0.85;
      } else if (currentHealth < 70) {
        severity = 'medium';
        confidence = 0.75;
      } else {
        severity = 'low';
        confidence = 0.65;
      }

      return {
        component,
        currentHealth,
        predictedFailureDate: failureDate.toISOString(),
        confidence,
        recommendation: this.getRecommendation(component, currentHealth),
        severity,
      };
    }

    return null;
  }

  private calculateDegradationRate(
    component: string,
    history: EnhancedTelemetry[]
  ): number {
    if (history.length < 2) return 0;

    const recentHistory = history.slice(-10); // Last 10 readings
    let totalDegradation = 0;

    for (let i = 1; i < recentHistory.length; i++) {
      const componentKey = component as keyof typeof recentHistory[0]['componentHealth'];
      const prevHealth = recentHistory[i - 1].componentHealth[componentKey] || 0;
      const currHealth = recentHistory[i].componentHealth[componentKey] || 0;
      totalDegradation += Math.max(0, prevHealth - currHealth);
    }

    return totalDegradation / recentHistory.length;
  }

  private getRecommendation(component: string, health: number): string {
    const recommendations: Record<string, Record<string, string>> = {
      engine: {
        critical: 'URGENT: Schedule engine inspection immediately. Potential major failure risk.',
        high: 'Schedule engine service within 48 hours. Check oil levels and cooling system.',
        medium: 'Plan engine maintenance within the next week. Monitor temperature closely.',
        low: 'Routine engine maintenance recommended. Check during next service.',
      },
      transmission: {
        critical: 'URGENT: Transmission failure imminent. Avoid driving until inspected.',
        high: 'Schedule transmission service immediately. Check fluid levels.',
        medium: 'Plan transmission inspection soon. Monitor for unusual sounds.',
        low: 'Regular transmission service recommended.',
      },
      brakes: {
        critical: 'URGENT: Brake system critical. Replace brake pads immediately.',
        high: 'Schedule brake inspection ASAP. Brake pad replacement needed soon.',
        medium: 'Plan brake service within next 500km. Monitor brake response.',
        low: 'Routine brake check recommended.',
      },
      battery: {
        critical: 'URGENT: Battery failure risk. Replace battery immediately.',
        high: 'Battery health declining rapidly. Replace within 24 hours.',
        medium: 'Plan battery replacement soon. Test charging system.',
        low: 'Monitor battery health. Test during next service.',
      },
      tires: {
        critical: 'URGENT: Tire replacement required immediately. Safety risk.',
        high: 'Replace tires within 48 hours. Check tire pressure daily.',
        medium: 'Plan tire replacement soon. Monitor tread depth.',
        low: 'Tires in acceptable condition. Rotate during next service.',
      },
      cooling: {
        critical: 'URGENT: Cooling system failure risk. Check coolant immediately.',
        high: 'Schedule cooling system inspection ASAP. Check for leaks.',
        medium: 'Plan cooling system service soon. Monitor temperature.',
        low: 'Routine cooling system check recommended.',
      },
      exhaust: {
        critical: 'URGENT: Exhaust system failure. Inspect immediately.',
        high: 'Schedule exhaust inspection soon. Check for leaks.',
        medium: 'Plan exhaust system check. Monitor for unusual sounds.',
        low: 'Routine exhaust inspection recommended.',
      },
      suspension: {
        critical: 'URGENT: Suspension failure risk. Inspect immediately.',
        high: 'Schedule suspension service ASAP. Check for damage.',
        medium: 'Plan suspension inspection soon. Monitor ride quality.',
        low: 'Routine suspension check recommended.',
      },
    };

    const componentRecs = recommendations[component] || recommendations.engine;
    
    if (health < 30) return componentRecs.critical;
    if (health < 50) return componentRecs.high;
    if (health < 70) return componentRecs.medium;
    return componentRecs.low;
  }

  public detectAnomalies(telemetry: EnhancedTelemetry): string[] {
    const anomalies: string[] = [];

    // Temperature anomalies
    if (telemetry.engineTemperature > 105) {
      anomalies.push('Engine overheating detected');
    }
    if (telemetry.coolantTemp > 95) {
      anomalies.push('Coolant temperature abnormally high');
    }

    // Pressure anomalies
    if (telemetry.oilPressure < 20) {
      anomalies.push('Low oil pressure warning');
    }
    if (telemetry.tirePressureFrontLeft < 28 || telemetry.tirePressureFrontRight < 28) {
      anomalies.push('Low tire pressure detected (front)');
    }

    // Electrical anomalies
    if (telemetry.batteryVoltage < 11.5) {
      anomalies.push('Battery voltage critically low');
    }

    // Performance anomalies
    if (telemetry.rpm > 7000 && telemetry.speed < 50) {
      anomalies.push('Unusual RPM pattern detected');
    }

    // Fuel anomalies
    if (telemetry.fuelLevel < 10) {
      anomalies.push('Low fuel warning');
    }

    return anomalies;
  }

  public getMaintenanceSchedule(telemetry: EnhancedTelemetry): Array<{
    item: string;
    dueDate: string;
    priority: 'low' | 'medium' | 'high';
  }> {
    const schedule: Array<{
      item: string;
      dueDate: string;
      priority: 'low' | 'medium' | 'high';
    }> = [];

    const now = new Date();

    // Oil change based on operating hours
    if (telemetry.totalOperatingHours > 3000 || telemetry.totalOperatingHours % 250 < 10) {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 30);
      schedule.push({
        item: 'Oil Change',
        dueDate: dueDate.toISOString(),
        priority: 'medium',
      });
    }

    // Tire rotation based on distance
    if (telemetry.totalDistanceKm > 10000 || telemetry.totalDistanceKm % 8000 < 100) {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 45);
      schedule.push({
        item: 'Tire Rotation',
        dueDate: dueDate.toISOString(),
        priority: 'low',
      });
    }

    // Brake inspection
    if (telemetry.componentHealth.brakes < 60) {
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 14);
      schedule.push({
        item: 'Brake Inspection',
        dueDate: dueDate.toISOString(),
        priority: 'high',
      });
    }

    return schedule;
  }
}
