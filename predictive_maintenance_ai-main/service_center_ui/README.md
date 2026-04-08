# Service Center UI

Dedicated frontend for service-center operations in the predictive maintenance platform.

## Features

- Dashboard KPI overview for live operations
- Approval inbox for scheduling recommendations (approve/reject)
- Booking calendar view + daily booking list
- Notification center with read/ack actions
- Vehicle quick panel with risk and owner details
- Settings panel for API base override, recipient filter, and polling cadence
- Realtime stream integration with polling fallback when websocket disconnects

## Backend Integration

This app consumes your existing multi-agent backend endpoints:

- `/api/fleet/status`
- `/api/scheduling/recommendations`
- `/api/scheduling/list`
- `/api/notifications`
- `/api/stream/ws`

It is designed to run in parallel with other frontends against the same backend.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Copy env example and set API URL if needed:

```bash
cp .env.example .env
```

3. Start dev server:

```bash
npm run dev
```

Default dev port is `5174` so it can run alongside your main frontend.

## Multi-Frontend CORS

Ensure backend allows both frontend origins in `CORS_ORIGINS`, for example:

```env
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

## Build

```bash
npm run build
```
