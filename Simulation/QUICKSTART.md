# Quick Start Guide 🚀

## Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Modern web browser (Chrome, Firefox, Edge)

## Installation Steps

### 1. Navigate to Project Directory
```bash
cd c:\kathir\Final_Year_Project\Simulation
```

### 2. Install Dependencies (Already Done!)
```bash
npm install
```
✅ Dependencies are already installed including Socket.IO

### 3. Start Development Server
```bash
npm run dev
```

The server will start at: **http://localhost:3000**

You should see:
```
> Ready on http://localhost:3000
> WebSocket server ready on ws://localhost:3000/api/socket
```

### 4. Open Dashboard
Open your browser and navigate to:
```
http://localhost:3000
```

### 5. Start Simulation
1. Click the green **"Start Simulation"** button in the top-right
2. Watch as 10 vehicles begin streaming real-time telemetry data
3. Explore different tabs:
   - **Fleet Overview**: See all vehicles at a glance
   - **Vehicle Details**: Click a vehicle to see detailed metrics
   - **Predictive Maintenance**: View AI predictions and alerts

## Troubleshooting

### Port Already in Use
If port 3000 is busy:
```bash
# Kill process on port 3000 (Windows)
npx kill-port 3000

# Or specify different port
$env:PORT=3001; npm run dev
```

### WebSocket Connection Issues
1. Check browser console for errors (F12)
2. Ensure no firewall blocking localhost:3000
3. Try refreshing the page
4. Check that green "Connected" badge appears in header

### No Data Appearing
1. Make sure you clicked "Start Simulation"
2. Check browser console for errors
3. Verify WebSocket connection status (green dot in header)
4. Try stopping and starting simulation again

## Features to Try

### 1. Fleet Monitoring
- Observe 10 different vehicles with varying health levels
- Watch real-time metrics update every second
- See color-coded health indicators (green/yellow/orange/red)

### 2. Vehicle Selection
- Click any vehicle card in Fleet Overview
- Switch to Vehicle Details tab
- Observe live metrics: speed, RPM, temperature, fuel
- Check 8 component health bars

### 3. Predictive Maintenance
- Go to Predictive Maintenance tab
- Look for failure predictions (appear when health < 40%)
- Review maintenance recommendations
- Monitor urgency levels (routine → critical)

### 4. Real-Time Alerts
- Watch for yellow alert banners at top
- Alerts show anomalies like:
  - Engine overheating
  - Battery voltage drops
  - Brake degradation

### 5. Live Statistics
- Top cards show:
  - Total fleet count
  - Healthy vehicles (>80% health)
  - Critical vehicles needing attention
  - Average fleet health

## Stopping the Simulation

1. Click the red **"Stop Simulation"** button
2. Data streaming will pause
3. Last known state remains visible
4. Can restart anytime

## Production Build

To build for production:
```bash
npm run build
npm start
```

## Configuration Options

### Change Number of Vehicles
Edit: `app/api/simulation/start/route.ts`
```typescript
fleetManager = new FleetManager(20, 1000); // 20 vehicles
```

### Adjust Update Frequency
Edit: `app/api/simulation/start/route.ts`
```typescript
fleetManager = new FleetManager(10, 500); // Update every 0.5s
```

### Modify Vehicle Types
Edit: `lib/fleet-manager.ts` - Line 24-28
```typescript
const vehicleTypes = ['sedan', 'suv', 'truck', /* add more */];
```

## Tech Stack Used
- ⚡ **Next.js 16** - React framework
- 🔌 **Socket.IO** - WebSocket real-time communication
- 🎨 **Tailwind CSS** - Styling
- 📊 **Radix UI** - Component library
- 🚗 **Custom Physics Engine** - Realistic simulation
- 🤖 **AI Predictions** - Maintenance forecasting

## API Endpoints

### Start Simulation
```http
POST http://localhost:3000/api/simulation/start
```

### Stop Simulation
```http
POST http://localhost:3000/api/simulation/stop
```

### Get Current Telemetry
```http
GET http://localhost:3000/api/simulation/start
```

### WebSocket Connection
```javascript
ws://localhost:3000/api/socket
```

## Development Tips

### Hot Reload
All changes to TypeScript/React files will auto-reload in browser

### View Console Logs
Open browser DevTools (F12) to see:
- WebSocket connection status
- Real-time data updates
- Any errors or warnings

### Inspect Network Traffic
1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Click connection to see live messages

## Next Steps

1. ✅ Start the simulation
2. ✅ Explore all three tabs
3. ✅ Click on different vehicles
4. ✅ Watch health degrade over time
5. ✅ Observe failure predictions
6. ✅ Check maintenance alerts

## Need Help?

- Check browser console for errors (F12)
- Review `README.md` for detailed documentation
- Ensure npm dependencies are installed
- Verify Node.js version: `node --version` (should be 18+)

---

**Enjoy your real-time vehicle simulation! 🚗💨**
