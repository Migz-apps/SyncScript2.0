import * as http from "http";
import { randomUUID } from "crypto";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { loadConfig } from "./config";
import { DistributedRoomBus, type DistributedRoomEvent } from "./distributedBus";
import { buildLogger } from "./logger";
import { ServerMetrics } from "./metrics";
import { RoomManager } from "./roomManager";
import { createStateStore } from "./stateStore";
import { SyncEngine } from "./syncEngine";

interface ExtendedWebSocket extends WebSocket {
  socketId?: string;
  roomId?: string;
  username?: string;
  isAlive?: boolean;
  lastPingStartedAt?: number;
}

const config = loadConfig();
const logger = buildLogger(config.logLevel);
const metrics = new ServerMetrics(config.metricsEnabled);
const stateStore = createStateStore({
  redisUrl: config.redisUrl,
  keyPrefix: config.redisKeyPrefix
});
const roomManager = new RoomManager(stateStore, logger);
const syncEngine = new SyncEngine(logger, metrics);
const distributedBus = new DistributedRoomBus(config.redisUrl, config.redisKeyPrefix);

const server = http.createServer(async (req, res) => {
  if (req.url === "/health/live") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/health/ready") {
    const ready = stateStore.isReady() && distributedBus.isReady();
    res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: ready ? "ready" : "degraded" }));
    return;
  }

  if (req.url === "/metrics") {
    res.writeHead(200, { "Content-Type": metrics.register.contentType });
    res.end(await metrics.register.metrics());
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      message: "SyncScript signaling server",
      mode: stateStore.mode
    })
  );
});

const wss = new WebSocketServer({ server });

function sendMessage(ws: ExtendedWebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  ws.send(JSON.stringify(payload));
  metrics.observeMessageSent(String(payload.type ?? "UNKNOWN"));
}

function resetRoomBindings(roomId: string): void {
  for (const client of wss.clients) {
    const socket = client as ExtendedWebSocket;
    if (socket.roomId === roomId) {
      socket.roomId = undefined;
    }
  }
}

async function publishRoomEvent(event: DistributedRoomEvent): Promise<void> {
  await syncEngine.fanOutToRoom(wss, distributedBus, event);

  if (event.payload.type === "ROOM_TERMINATED") {
    resetRoomBindings(event.roomId);
  }
}

async function refreshRoomMetric(): Promise<void> {
  metrics.setActiveRooms((await roomManager.listRooms()).length);
}

async function processRoomCleanup(): Promise<void> {
  const staleRooms = await roomManager.cleanInactiveRooms(config.roomTtlMs);
  for (const room of staleRooms) {
    await publishRoomEvent({
      originNodeId: config.nodeId,
      roomId: room.roomId,
      payload: {
        type: "ROOM_TERMINATED",
        reason: "INACTIVE_ROOM_CLEANUP"
      }
    });
  }

  const expiringRooms = await roomManager.getExpiredDeactivations();
  for (const room of expiringRooms) {
    await roomManager.deleteRoom(room.roomId);
    await publishRoomEvent({
      originNodeId: config.nodeId,
      roomId: room.roomId,
      payload: {
        type: "ROOM_TERMINATED"
      }
    });
  }

  await refreshRoomMetric();
}

async function handleMessage(ws: ExtendedWebSocket, rawMessage: RawData): Promise<void> {
  const data = JSON.parse(rawMessage.toString()) as Record<string, unknown>;
  const messageType = String(data.type ?? "UNKNOWN");
  metrics.observeMessageReceived(messageType);

  switch (messageType) {
    case "CREATE_ROOM": {
      const adminName = String(data.adminName ?? "Admin");
      const roomKey = String(data.key ?? "");
      const roomName = String(data.roomName ?? "New Room");
      const socketId = ws.socketId ?? randomUUID();

      const room = await roomManager.createRoom(adminName, roomKey, roomName, socketId);
      ws.roomId = room.roomId;
      ws.username = adminName;

      await roomManager.addUser(socketId, adminName, room.roomId);
      const users = await roomManager.listUsers(room.roomId);
      await refreshRoomMetric();

      sendMessage(ws, {
        type: "ROOM_CREATED",
        room,
        isAdmin: true,
        users
      });

      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: room.roomId,
        senderSocketId: socketId,
        payload: {
          type: "USER_JOINED",
          socketId,
          username: adminName,
          users
        }
      });
      break;
    }

    case "JOIN_ROOM": {
      const roomId = String(data.roomId ?? "");
      const securityKey = String(data.key ?? "");
      const userName = String(data.userName ?? "Guest");

      const joinResult = await roomManager.joinRoom(roomId, securityKey);
      if (!joinResult.success || !joinResult.room) {
        sendMessage(ws, {
          type: "JOIN_RESULT",
          ...joinResult,
          isAdmin: false
        });
        return;
      }

      const socketId = ws.socketId ?? randomUUID();
      ws.roomId = roomId;
      ws.username = userName;

      await roomManager.addUser(socketId, userName, roomId);
      const room = await roomManager.getRoom(roomId);
      const users = await roomManager.listUsers(roomId);

      sendMessage(ws, {
        type: "JOIN_RESULT",
        success: true,
        room: joinResult.room,
        isAdmin: room?.adminId === socketId,
        users
      });

      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId,
        senderSocketId: socketId,
        payload: {
          type: "USER_JOINED",
          socketId,
          username: userName,
          users
        }
      });
      break;
    }

    case "ARCH_SHARE": {
      if (!ws.roomId || !ws.socketId) {
        return;
      }

      await roomManager.recordActivity(ws.roomId);
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        senderSocketId: ws.socketId,
        payload: {
          type: "ARCH_SHARE",
          manifest: Array.isArray(data.manifest) ? data.manifest : [],
          sender: ws.username ?? "Unknown"
        }
      });
      break;
    }

    case "FILE_CHANGE": {
      if (!ws.roomId || !ws.socketId) {
        return;
      }

      await roomManager.recordActivity(ws.roomId);
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        senderSocketId: ws.socketId,
        payload: {
          type: "FILE_CHANGE",
          fileUri: String(data.fileUri ?? ""),
          changes: Array.isArray(data.changes) ? data.changes : [],
          sender: ws.username ?? "Unknown"
        }
      });
      break;
    }

    case "DEACTIVATE_ROOM": {
      if (!ws.roomId || !ws.socketId) {
        return;
      }

      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) {
        return;
      }

      await roomManager.startDeactivation(ws.roomId, Date.now() + config.deactivationMs);
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        payload: {
          type: "DEACTIVATION_START",
          duration: Math.floor(config.deactivationMs / 1000)
        }
      });
      break;
    }

    case "CANCEL_DEACTIVATION": {
      if (!ws.roomId || !ws.socketId) {
        return;
      }

      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) {
        return;
      }

      await roomManager.cancelDeactivation(ws.roomId);
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        payload: {
          type: "DEACTIVATION_CANCELLED"
        }
      });
      break;
    }

    default: {
      logger.warn("unknown_message_type", {
        socketId: ws.socketId,
        type: messageType
      });
    }
  }
}

async function bootstrap(): Promise<void> {
  await stateStore.connect();
  await distributedBus.start(async (event) => {
    if (event.originNodeId === config.nodeId) {
      return;
    }

    syncEngine.broadcastToRoom(wss, event.roomId, event.senderSocketId, event.payload);
    if (event.payload.type === "ROOM_TERMINATED") {
      resetRoomBindings(event.roomId);
    }
  });

  wss.on("connection", (ws, request) => {
    const socket = ws as ExtendedWebSocket;
    socket.socketId = randomUUID();
    socket.isAlive = true;
    metrics.setActiveConnections(wss.clients.size);

    logger.info("socket_connected", {
      remoteAddress: request.socket.remoteAddress,
      socketId: socket.socketId
    });

    socket.on("pong", () => {
      socket.isAlive = true;
      if (socket.lastPingStartedAt) {
        metrics.observeWebSocketRtt(Date.now() - socket.lastPingStartedAt);
        socket.lastPingStartedAt = undefined;
      }
    });

    socket.on("message", async (message, isBinary) => {
      if (isBinary) {
        logger.warn("binary_message_rejected", { socketId: socket.socketId });
        return;
      }

      try {
        await handleMessage(socket, message);
      } catch (error) {
        logger.error("message_processing_failed", {
          error,
          socketId: socket.socketId
        });
      }
    });

    socket.on("error", (error) => {
      logger.warn("socket_error", {
        error,
        socketId: socket.socketId
      });
    });

    socket.on("close", async () => {
      metrics.setActiveConnections(wss.clients.size);

      if (!socket.socketId) {
        return;
      }

      try {
        const removedUser = await roomManager.removeUser(socket.socketId);
        if (!removedUser) {
          return;
        }

        const users = await roomManager.listUsers(removedUser.roomId);
        await publishRoomEvent({
          originNodeId: config.nodeId,
          roomId: removedUser.roomId,
          senderSocketId: socket.socketId,
          payload: {
            type: "USER_LEFT",
            socketId: socket.socketId,
            username: socket.username ?? removedUser.username,
            users
          }
        });
      } catch (error) {
        logger.error("socket_cleanup_failed", {
          error,
          socketId: socket.socketId
        });
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const socket = client as ExtendedWebSocket;
      if (!socket.isAlive) {
        logger.info("terminating_stale_socket", { socketId: socket.socketId });
        socket.terminate();
        continue;
      }

      socket.isAlive = false;
      socket.lastPingStartedAt = Date.now();
      socket.ping();
    }
  }, config.heartbeatMs);

  const cleanupTimer = setInterval(async () => {
    try {
      await processRoomCleanup();
    } catch (error) {
      logger.error("cleanup_failed", { error });
    }
  }, config.cleanupIntervalMs);

  server.listen(config.port, config.host, async () => {
    await refreshRoomMetric();
    logger.info("signaling_server_started", {
      host: config.host,
      mode: stateStore.mode,
      nodeId: config.nodeId,
      port: config.port
    });
  });

  const shutdown = async () => {
    clearInterval(heartbeat);
    clearInterval(cleanupTimer);
    wss.close();
    server.close();
    await distributedBus.stop();
    await stateStore.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void bootstrap().catch((error) => {
  logger.error("bootstrap_failed", { error });
  process.exit(1);
});
