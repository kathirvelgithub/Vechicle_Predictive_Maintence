import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { EnhancedTelemetry } from './telemetry-types';

let io: SocketIOServer | null = null;

export function initializeWebSocket(server: HTTPServer) {
  if (io) return io;

  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/api/socket',
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    socket.on('start-simulation', (data) => {
      console.log('Starting simulation for:', data);
      socket.emit('simulation-started', { success: true });
    });

    socket.on('stop-simulation', () => {
      console.log('Stopping simulation');
      socket.emit('simulation-stopped', { success: true });
    });
  });

  return io;
}

export function getWebSocketServer() {
  return io;
}

export function broadcastTelemetry(telemetry: EnhancedTelemetry | EnhancedTelemetry[]) {
  if (!io) return;
  
  io.emit('telemetry-update', telemetry);
}

export function broadcastMaintenanceAlert(alert: any) {
  if (!io) return;
  
  io.emit('maintenance-alert', alert);
}
