# Admin UI

Dedicated admin control-plane frontend for the predictive maintenance platform.

## Current Phase

Phase 1 foundation is implemented with a separate app shell and admin module navigation.

## Modules

- Control Dashboard
- Users and Roles (phase-1 matrix + current identity)
- Fleet Control (includes Add Vehicle request queue)
- Security Monitor (stream events + high-risk watch)
- Audit Timeline (local phase-1 timeline + export)
- Global Settings (API override, polling, recipient defaults)
- Diagnostics (auth/api endpoints, readiness payload, stream status)

## Access

This app uses the same token as the main frontend and checks the current user from auth-service.
Only `SYSTEM_ADMIN` and `ADMIN` roles can enter the admin control-plane.

## Environment

Create `.env` from `.env.example` and adjust as needed:

- `VITE_API_BASE_URL`
- `VITE_AUTH_BASE_URL`
- `VITE_STREAM_WS_URL` (optional)

## Run Locally

```bash
npm install
npm run dev
```

Default dev port is `5175`.

## Notes

- Some power actions are backend-dependent and are currently staged as phase-1 queue/audit interactions.
- For production security, enforce all admin permissions on backend APIs, not frontend-only checks.
