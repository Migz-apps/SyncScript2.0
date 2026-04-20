import { WebSocket, WebSocketServer } from "ws";
import type { Logger } from "winston";
import type { DistributedRoomBus, DistributedRoomEvent } from "./distributedBus";
import type { ServerMetrics } from "./metrics";

interface RoomBoundSocket extends WebSocket {
  roomId?: string;
  socketId?: string;
}

export class SyncEngine {
  constructor(
    private readonly logger: Logger,
    private readonly metrics: ServerMetrics
  ) {}

  public broadcastToRoom(
    wss: WebSocketServer,
    roomId: string,
    senderSocketId: string | undefined,
    payload: Record<string, unknown>
  ): number {
    let deliveredCount = 0;
    const message = JSON.stringify(payload);
    const eventType = String(payload.type ?? "UNKNOWN");

    for (const client of wss.clients) {
      const socket = client as RoomBoundSocket;
      if (
        socket.readyState === WebSocket.OPEN &&
        socket.roomId === roomId &&
        socket.socketId !== senderSocketId
      ) {
        socket.send(message);
        deliveredCount += 1;
      }
    }

    if (deliveredCount > 0) {
      this.metrics.observeMessageSent(eventType, deliveredCount);
    }

    this.logger.debug("room_broadcast", {
      deliveredCount,
      roomId,
      senderSocketId,
      type: eventType
    });

    return deliveredCount;
  }

  public async fanOutToRoom(
    wss: WebSocketServer,
    bus: DistributedRoomBus,
    event: DistributedRoomEvent
  ): Promise<void> {
    const start = Date.now();
    this.broadcastToRoom(wss, event.roomId, event.senderSocketId, event.payload);

    if (bus.isEnabled()) {
      await bus.publish(event);
    }

    this.metrics.observeRelay(String(event.payload.type ?? "UNKNOWN"), Date.now() - start);
  }
}
