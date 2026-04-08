import { getStreamWsCandidates } from "./config";

export type StreamTopic =
  | "stream.connected"
  | "stream.pong"
  | "telemetry.latest"
  | "anomaly.event"
  | "analysis.completed"
  | string;

export interface StreamEvent {
  topic: StreamTopic;
  payload: Record<string, unknown>;
  timestamp?: string;
}

type EventListener = (event: StreamEvent) => void;
type ConnectionListener = (connected: boolean) => void;

class RealtimeStreamClient {
  private socket: WebSocket | null = null;
  private socketUrlIndex = 0;
  private started = false;
  private connected = false;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private disposed = false;

  private eventListeners = new Set<EventListener>();
  private connectionListeners = new Set<ConnectionListener>();

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.disposed = false;
    this.socketUrlIndex = 0;
    this.connect();
  }

  stop(): void {
    this.disposed = true;
    this.started = false;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.setConnected(false);
  }

  subscribe(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.connected);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private connect(): void {
    if (this.disposed || !this.started) {
      return;
    }

    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const candidates = this.getSocketCandidates();
    const targetUrl = candidates[this.socketUrlIndex % candidates.length];

    try {
      this.socket = new WebSocket(targetUrl);
    } catch {
      this.setConnected(false);
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setConnected(true);
      this.startHeartbeat();
    };

    this.socket.onmessage = (event: MessageEvent) => {
      const parsed = this.parseMessage(event.data);
      if (!parsed) {
        return;
      }
      this.eventListeners.forEach((listener) => listener(parsed));
    };

    this.socket.onerror = () => {
      this.setConnected(false);
    };

    this.socket.onclose = () => {
      this.stopHeartbeat();
      this.setConnected(false);
      this.socket = null;
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    };
  }

  private parseMessage(raw: unknown): StreamEvent | null {
    if (typeof raw !== "string") {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StreamEvent>;
      if (!parsed || typeof parsed.topic !== "string") {
        return null;
      }
      const payload =
        parsed.payload && typeof parsed.payload === "object" && !Array.isArray(parsed.payload)
          ? (parsed.payload as Record<string, unknown>)
          : {};

      return {
        topic: parsed.topic,
        payload,
        timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : undefined,
      };
    } catch {
      return null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        this.socket.send("ping");
      } catch {
        // Ignore transient failures and rely on reconnect logic.
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.disposed || !this.started) {
      return;
    }

    const delayMs = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      const candidates = this.getSocketCandidates();
      if (candidates.length > 1) {
        this.socketUrlIndex = (this.socketUrlIndex + 1) % candidates.length;
      }
      this.connect();
    }, delayMs);
  }

  private getSocketCandidates(): string[] {
    const candidates = getStreamWsCandidates();
    return candidates.length > 0 ? candidates : ["ws://localhost:8000/api/stream/ws"];
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setConnected(next: boolean): void {
    if (this.connected === next) {
      return;
    }

    this.connected = next;
    this.connectionListeners.forEach((listener) => listener(next));
  }
}

export const stream = new RealtimeStreamClient();
