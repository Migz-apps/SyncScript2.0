import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from "prom-client";

export class ServerMetrics {
  public readonly register = new Registry();

  private readonly activeConnections = new Gauge({
    name: "syncscript_ws_active_connections",
    help: "Number of currently connected WebSocket clients",
    registers: [this.register]
  });

  private readonly activeRooms = new Gauge({
    name: "syncscript_active_rooms",
    help: "Number of active collaboration rooms",
    registers: [this.register]
  });

  private readonly messagesReceived = new Counter({
    name: "syncscript_messages_received_total",
    help: "Count of inbound WebSocket messages grouped by type",
    labelNames: ["type"],
    registers: [this.register]
  });

  private readonly messagesSent = new Counter({
    name: "syncscript_messages_sent_total",
    help: "Count of outbound WebSocket messages grouped by type",
    labelNames: ["type"],
    registers: [this.register]
  });

  private readonly relayLatency = new Histogram({
    name: "syncscript_room_relay_latency_ms",
    help: "Latency for relaying room events",
    labelNames: ["type"],
    buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
    registers: [this.register]
  });

  private readonly websocketRtt = new Histogram({
    name: "syncscript_ws_round_trip_ms",
    help: "Measured WebSocket ping/pong round-trip time",
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
    registers: [this.register]
  });

  constructor(enabled: boolean) {
    if (enabled) {
      collectDefaultMetrics({
        register: this.register,
        prefix: "syncscript_node_"
      });
    }
  }

  public setActiveConnections(count: number): void {
    this.activeConnections.set(count);
  }

  public setActiveRooms(count: number): void {
    this.activeRooms.set(count);
  }

  public observeMessageReceived(type: string): void {
    this.messagesReceived.labels(type).inc();
  }

  public observeMessageSent(type: string, count = 1): void {
    this.messagesSent.labels(type).inc(count);
  }

  public observeRelay(type: string, durationMs: number): void {
    this.relayLatency.labels(type).observe(durationMs);
  }

  public observeWebSocketRtt(durationMs: number): void {
    this.websocketRtt.observe(durationMs);
  }
}
