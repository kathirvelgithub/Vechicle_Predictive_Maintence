export interface EngineReplayPoint {
  rpmRaw: number;
  lubOilPressureBar: number;
  coolantTempC: number;
  lubOilTempC: number;
}

// Sampled from predictive_maintenance_ai-main/engine_data.csv
// This keeps the simulator anchored to real observed distributions.
export const ENGINE_REPLAY_POINTS: EngineReplayPoint[] = [
  { rpmRaw: 700, lubOilPressureBar: 2.49, coolantTempC: 81.63, lubOilTempC: 84.14 },
  { rpmRaw: 876, lubOilPressureBar: 2.94, coolantTempC: 82.45, lubOilTempC: 77.64 },
  { rpmRaw: 520, lubOilPressureBar: 2.96, coolantTempC: 79.65, lubOilTempC: 77.75 },
  { rpmRaw: 473, lubOilPressureBar: 3.71, coolantTempC: 71.77, lubOilTempC: 74.13 },
  { rpmRaw: 619, lubOilPressureBar: 5.67, coolantTempC: 87.0, lubOilTempC: 78.4 },
  { rpmRaw: 1221, lubOilPressureBar: 3.99, coolantTempC: 75.67, lubOilTempC: 76.4 },
  { rpmRaw: 716, lubOilPressureBar: 3.57, coolantTempC: 79.79, lubOilTempC: 83.65 },
  { rpmRaw: 729, lubOilPressureBar: 3.85, coolantTempC: 71.67, lubOilTempC: 77.92 },
  { rpmRaw: 845, lubOilPressureBar: 4.88, coolantTempC: 70.5, lubOilTempC: 76.3 },
  { rpmRaw: 824, lubOilPressureBar: 3.74, coolantTempC: 85.14, lubOilTempC: 77.07 },
  { rpmRaw: 1230, lubOilPressureBar: 3.43, coolantTempC: 85.92, lubOilTempC: 77.41 },
  { rpmRaw: 538, lubOilPressureBar: 4.26, coolantTempC: 81.18, lubOilTempC: 80.18 },
  { rpmRaw: 1187, lubOilPressureBar: 2.59, coolantTempC: 84.97, lubOilTempC: 78.1 },
  { rpmRaw: 609, lubOilPressureBar: 3.75, coolantTempC: 75.58, lubOilTempC: 77.28 },
  { rpmRaw: 606, lubOilPressureBar: 2.27, coolantTempC: 77.73, lubOilTempC: 75.17 },
  { rpmRaw: 382, lubOilPressureBar: 2.16, coolantTempC: 71.62, lubOilTempC: 77.0 },
  { rpmRaw: 560, lubOilPressureBar: 2.83, coolantTempC: 70.77, lubOilTempC: 77.18 },
  { rpmRaw: 767, lubOilPressureBar: 4.6, coolantTempC: 80.27, lubOilTempC: 84.92 },
  { rpmRaw: 838, lubOilPressureBar: 3.38, coolantTempC: 88.78, lubOilTempC: 77.26 },
  { rpmRaw: 920, lubOilPressureBar: 3.56, coolantTempC: 79.8, lubOilTempC: 79.4 },
  { rpmRaw: 1005, lubOilPressureBar: 3.95, coolantTempC: 83.1, lubOilTempC: 80.2 },
  { rpmRaw: 1114, lubOilPressureBar: 4.12, coolantTempC: 82.6, lubOilTempC: 81.0 },
  { rpmRaw: 740, lubOilPressureBar: 3.2, coolantTempC: 78.2, lubOilTempC: 76.9 },
  { rpmRaw: 680, lubOilPressureBar: 2.78, coolantTempC: 76.4, lubOilTempC: 75.8 },
  { rpmRaw: 965, lubOilPressureBar: 4.35, coolantTempC: 84.2, lubOilTempC: 82.1 },
  { rpmRaw: 1088, lubOilPressureBar: 4.55, coolantTempC: 85.0, lubOilTempC: 82.7 },
  { rpmRaw: 590, lubOilPressureBar: 2.98, coolantTempC: 74.9, lubOilTempC: 76.1 },
  { rpmRaw: 640, lubOilPressureBar: 3.05, coolantTempC: 75.6, lubOilTempC: 76.8 },
  { rpmRaw: 875, lubOilPressureBar: 3.8, coolantTempC: 80.9, lubOilTempC: 79.9 },
  { rpmRaw: 1140, lubOilPressureBar: 4.22, coolantTempC: 83.8, lubOilTempC: 81.6 },
];
