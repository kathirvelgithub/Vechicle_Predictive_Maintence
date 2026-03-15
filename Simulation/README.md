# Real-Time Vehicle Telemetry Simulation System

A sophisticated real-time vehicle simulation platform with AI-powered predictive maintenance capabilities, featuring WebSocket streaming and an attractive modern UI.

Telemetry Generation Algorithms
You're using 3 main algorithms:

1. Markov Driving Cycle State Machine 🚗
Models realistic driving patterns: idle, city, highway, acceleration, braking
Transition probability matrix with state-specific dwell times
Each state has target parameters (speed, RPM, engine load)
Example: From highway → 72% chance stay, 12% accelerate, 10% city
2. Ornstein-Uhlenbeck (OU) Noise Process 📊
Formula: dX = θ(μ − X) + σ·ε where ε ~ N(0,1)
More realistic than simple random noise - parameters naturally revert to target means
Per-parameter tuning: speed (θ=0.15), RPM (θ=0.20), battery (θ=0.30), etc.
Box-Muller Gaussian noise generation for realistic stochastic behavior
3. NASA CMAPSS Piecewise Wear Model 🔧
Based on NASA's Computational Maintenance And Prognostics Simulation Set
Component health degrades non-linearly: rate_multiplier = 1 + 2·(1 − health/100)²
Tracks 5 components: engine, brakes, battery, cooling, tires
Harsh driving (acceleration/braking) accelerates wear
As health drops, parameters shift toward failure thresholds



## 🚀 Features

### Real-Time Data Streaming
- **WebSocket Communication**: Continuous real-time telemetry data streaming
- **Multi-Vehicle Fleet**: Simulate up to 10 vehicles simultaneously
- **Sub-Second Updates**: Real-time updates every 1 second
- **Live Dashboards**: Instant UI updates without page refresh

### Comprehensive Telemetry Data
Each vehicle generates over 40 real-time metrics including:
- **Engine Metrics**: Temperature, torque, power, oil pressure
- **Performance Data**: Speed, RPM, acceleration, gear position
- **Component Health**: Engine, transmission, brakes, tires, battery
- **Driving Behavior**: Harsh braking/acceleration detection, driving score
- **Location Data**: GPS coordinates with realistic movement simulation
- **Predictive Analytics**: Component failure predictions with confidence scores

### AI-Powered Predictive Maintenance
- **Failure Prediction**: ML-based component failure forecasting
- **Health Monitoring**: Real-time component health analysis (0-100%)
- **Maintenance Scheduling**: Intelligent maintenance recommendations
- **Anomaly Detection**: Automatic detection of unusual patterns
- **Risk Assessment**: Critical, high, medium, low risk classifications
- **Degradation Tracking**: Historical data analysis for trend prediction

### Modern UI Design
- **Dark Theme**: Sleek gradient-based dark design
- **Real-Time Animations**: Smooth transitions and pulse effects
- **Responsive Layout**: Optimized for all screen sizes
- **Color-Coded Alerts**: Intuitive visual status indicators
- **Multiple Views**: Fleet overview, vehicle details, maintenance dashboard
- **Interactive Cards**: Click vehicles for detailed information

## 🏗️ Architecture

### Technology Stack
- **Frontend**: Next.js 16 (React 19), TypeScript
- **UI Components**: Radix UI, Tailwind CSS
- **Real-Time**: Socket.IO (WebSocket)
- **Icons**: Lucide React
- **Simulation**: Custom physics-based engine

### Core Components

#### 1. Realistic Simulator (`lib/realistic-simulator.ts`)
Physics-based vehicle simulation engine with:
- Multiple vehicle types (sedan, SUV, truck, sports car, EV)
- Realistic driving behavior patterns
- Component wear and tear simulation
- Anomaly generation
- Cumulative statistics tracking

#### 2. Fleet Manager (`lib/fleet-manager.ts`)
Manages multiple vehicle simulators:
- Fleet initialization and lifecycle management
- Coordinated updates across all vehicles
- Telemetry aggregation and broadcasting
- Individual vehicle access

#### 3. Predictive Maintenance Engine (`lib/predictive-maintenance.ts`)
AI-powered analysis system:
- Historical data tracking (last 100 readings per vehicle)
- Degradation rate calculation
- Failure prediction algorithms
- Maintenance recommendations
- Anomaly detection rules

#### 4. WebSocket Server (`server.js`)
Custom Next.js server with Socket.IO:
- Real-time bidirectional communication
- Connection management
- Telemetry broadcasting
- Alert notifications

## 📦 Installation

1. **Clone the repository**
```bash
cd c:\kathir\Final_Year_Project\Simulation
```

2. **Install dependencies**
```bash
npm install
```

3. **Run development server**
```bash
npm run dev
```

4. **Access the application**
```
http://localhost:3000
```

## 🎮 Usage

### Starting the Simulation
1. Open the dashboard at `http://localhost:3000`
2. Click the **"Start Simulation"** green button in the header
3. Watch as vehicles begin generating real-time telemetry data
4. The fleet overview will populate with 10 active vehicles

### Viewing Vehicle Details
1. Navigate to the **"Fleet Overview"** tab
2. Click on any vehicle card in the grid
3. Switch to the **"Vehicle Details"** tab to see comprehensive metrics
4. Monitor real-time updates for speed, RPM, temperature, and more

### Monitoring Maintenance
1. Go to the **"Predictive Maintenance"** tab
2. View failure predictions and risk assessments
3. Check components needing maintenance
4. Review maintenance schedule recommendations

### Stopping the Simulation
1. Click the **"Stop Simulation"** red button
2. All vehicles will stop generating data
3. Last known state is preserved

## 📊 Data Flow

```
RealisticSimulator → FleetManager → WebSocket Server → Dashboard
       ↓                                    ↓
  Physics Engine              Broadcast telemetry
  Component Wear                  ↓
  Anomaly Gen            Connected Clients (UI)
       ↓                          ↓
  EnhancedTelemetry      Real-time UI Updates
```

## 🔧 Configuration

### Vehicle Count
Modify in `app/api/simulation/start/route.ts`:
```typescript
fleetManager = new FleetManager(10, 1000); // 10 vehicles
```

### Update Frequency
Adjust the second parameter (milliseconds):
```typescript
fleetManager = new FleetManager(10, 500); // Update every 0.5 seconds
```

### Vehicle Types
Configure in `lib/realistic-simulator.ts`:
```typescript
const vehicleTypes = ['sedan', 'suv', 'truck', 'sportsCar', 'electricVehicle'];
```

## 📡 API Endpoints

### Start Simulation
```
POST /api/simulation/start
Returns: { success: boolean, vehicleCount: number }
```

### Stop Simulation
```
POST /api/simulation/stop
Returns: { success: boolean }
```

### Get Telemetry
```
GET /api/simulation/start
Returns: { isRunning: boolean, telemetry: EnhancedTelemetry[] }
```

### WebSocket Events
```
// Client → Server
socket.emit('request-telemetry')

// Server → Client
socket.on('telemetry-update', (data) => {...})
socket.on('maintenance-alert', (alert) => {...})
```

## 🎨 UI Components

### Fleet Overview Cards
- **Total Fleet**: Active vehicle count
- **Healthy Vehicles**: Vehicles with >80% health
- **Critical Vehicles**: Vehicles needing urgent attention
- **Average Health**: Fleet-wide health score

### Vehicle Metrics
- **Primary Gauges**: Speed, RPM, temperature, fuel
- **Component Health Grid**: 8 major components with progress bars
- **Performance Stats**: Gear, acceleration, throttle, brake
- **Cumulative Data**: Operating hours, distance, scores

### Maintenance Dashboard
- **Failure Predictions**: Component-specific alerts
- **Maintenance Queue**: Sorted by urgency
- **Risk Levels**: Visual color-coding
- **Recommendations**: Actionable maintenance advice

## 🔮 Predictive Maintenance Features

### Health Scoring
- **100-80%**: Healthy (Green)
- **79-60%**: Warning (Yellow)
- **59-40%**: Degraded (Orange)
- **<40%**: Critical (Red, pulsing)

### Urgency Levels
- **None**: All systems optimal
- **Routine**: Regular service recommended
- **Soon**: Schedule maintenance within days
- **Urgent**: Immediate attention needed
- **Critical**: Safety risk, do not operate

### Failure Prediction
- Analyzes last 100 data points per component
- Calculates degradation rate
- Estimates time until failure
- Provides confidence score (65-95%)

## 🚗 Simulated Vehicle Behaviors

### Driving Patterns
- **Acceleration Phase** (30% of cycle): Increasing throttle
- **Cruising Phase** (30% of cycle): Steady speed
- **Deceleration Phase** (10% of cycle): Braking
- **Idle Phase** (30% of cycle): Stationary

### Anomaly Types
- Engine overheating
- Battery voltage drop
- Brake system degradation
- Tire pressure loss
- Low oil pressure

### Component Degradation
- Wear rates vary by component
- Accelerated wear under harsh conditions
- Realistic failure progression
- Maintenance resets health

## 📈 Performance

- **Simulation Frequency**: 1 Hz (1 update/second)
- **Data Points per Update**: 40+ metrics per vehicle
- **Vehicles Supported**: Up to 500 (configurable)
- **WebSocket Latency**: <50ms local
- **UI Update Rate**: 60 FPS animations

## 🛠️ Development

### Project Structure
```
Simulation/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── layout.tsx            # App layout
│   ├── globals.css           # Global styles
│   └── api/
│       ├── simulation/
│       │   ├── start/
│       │   └── stop/
│       └── telematics/
├── components/
│   └── ui/                   # Reusable UI components
├── lib/
│   ├── realistic-simulator.ts      # Physics engine
│   ├── fleet-manager.ts            # Fleet coordination
│   ├── predictive-maintenance.ts   # AI analysis
│   ├── telemetry-types.ts          # Type definitions
│   └── utils.ts                    # Utilities
├── server.js                 # Custom WebSocket server
└── package.json
```

### Adding New Metrics
1. Update `EnhancedTelemetry` interface in `lib/telemetry-types.ts`
2. Add calculation logic in `RealisticSimulator.updateTelemetry()`
3. Display in dashboard UI components

### Customizing Vehicles
1. Modify vehicle profiles in `getVehicleProfile()`
2. Adjust physics calculations in `updatePhysics()`
3. Tune wear rates in `updateWearAndTear()`

## 🎯 Use Cases

- **Fleet Management**: Monitor real-time vehicle health
- **Predictive Maintenance**: Reduce downtime with AI predictions
- **Training Simulations**: Teach maintenance procedures
- **Research**: Study component degradation patterns
- **Demo Systems**: Showcase IoT/telemetry capabilities
- **Data Generation**: Create datasets for ML training

## 📝 License

This project is for educational and demonstration purposes.

## 🤝 Contributing

Feel free to fork, modify, and enhance the simulation system!

## 📧 Support

For issues or questions, please open an issue in the repository.

---

**Built with ❤️ using Next.js, TypeScript, and Socket.IO**
