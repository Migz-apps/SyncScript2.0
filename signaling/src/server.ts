import * as http from "http";
import { randomUUID } from "crypto";
import { RawData, WebSocket, WebSocketServer } from "ws";
import { AuditLog } from "./auditLog";
import { AuthService } from "./auth";
import { SERVER_VERSION, MAX_MESSAGE_BYTES } from "./constants";
import { loadConfig } from "./config";
import { DistributedRoomBus, type DistributedRoomEvent } from "./distributedBus";
import { buildLogger } from "./logger";
import { ServerMetrics } from "./metrics";
import { RateLimiter } from "./rateLimiter";
import { RoomManager } from "./roomManager";
import { SessionScheduler } from "./scheduler";
import { ServerSessionRecorder, exportRedisBackup } from "./sessionRecorder";
import { createStateStore } from "./stateStore";
import { loadStaticPage } from "./staticPages";
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
const auditLog = new AuditLog(logger);
const authService = new AuthService();
const sessionScheduler = new SessionScheduler();
const serverRecorder = new ServerSessionRecorder();
const rateLimiter = new RateLimiter(60, 30);
const stateStore = createStateStore({
  redisUrl: config.redisUrl,
  keyPrefix: config.redisKeyPrefix
});
const roomManager = new RoomManager(stateStore, logger);
const syncEngine = new SyncEngine(logger, metrics);
const distributedBus = new DistributedRoomBus(config.redisUrl, config.redisKeyPrefix);

const allowedIps = (process.env.ALLOWED_IPS ?? "").split(",").filter(Boolean);

const server = http.createServer(async (req, res) => {
  if (allowedIps.length > 0) {
    const clientIp = req.socket.remoteAddress ?? "";
    if (!allowedIps.some((ip) => clientIp.includes(ip.trim()))) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
  }

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

  if (req.url === "/audit") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ entries: auditLog.getRecent() }));
    return;
  }

  if (req.url === "/admin" || req.url === "/admin/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(loadStaticPage("admin.html"));
    return;
  }

  if (req.url === "/viewer" || req.url === "/viewer/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(loadStaticPage("viewer.html"));
    return;
  }

  if (req.url === "/admin/rooms") {
    const rooms = await roomManager.listRooms();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rooms }));
    return;
  }

  if (req.url === "/admin/backup") {
    const backup = await exportRedisBackup(config.redisUrl);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(backup));
    return;
  }

  if (req.url === "/admin/schedule") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ schedules: sessionScheduler.list() }));
    return;
  }

  if (req.url === "/admin/recordings") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ recordings: serverRecorder.list() }));
    return;
  }

  if (req.url === "/webhook" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      logger.info("webhook_received", { body: body.slice(0, 500) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ received: true }));
    });
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      message: "SyncScript signaling server",
      version: SERVER_VERSION,
      mode: stateStore.mode
    })
  );
});

const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES });

function sendMessage(ws: ExtendedWebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
  metrics.observeMessageSent(String(payload.type ?? "UNKNOWN"));
}

function sendToSocket(socketId: string, payload: Record<string, unknown>): void {
  for (const client of wss.clients) {
    const socket = client as ExtendedWebSocket;
    if (socket.socketId === socketId && socket.readyState === WebSocket.OPEN) {
      sendMessage(socket, payload);
      return;
    }
  }
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
      payload: { type: "ROOM_TERMINATED", reason: "INACTIVE_ROOM_CLEANUP" }
    });
  }

  const expiringRooms = await roomManager.getExpiredDeactivations();
  for (const room of expiringRooms) {
    await roomManager.deleteRoom(room.roomId);
    await publishRoomEvent({
      originNodeId: config.nodeId,
      roomId: room.roomId,
      payload: { type: "ROOM_TERMINATED" }
    });
  }

  await refreshRoomMetric();
}

const RELAY_TYPES = new Set([
  "ARCH_SHARE", "FILE_CHANGE", "FILE_CREATE", "FILE_DELETE", "FILE_RENAME",
  "FILE_CONTENT", "CURSOR_UPDATE", "TYPING_INDICATOR", "OPEN_FILE",
  "GIT_BRANCH", "DIAGNOSTICS_SHARE", "PORT_FORWARD", "TERMINAL_OUTPUT",
  "TEST_OUTPUT", "TUNNEL_REQUEST", "TUNNEL_RESPONSE", "ANNOTATION",
  "CHAT_MESSAGE", "DEBUG_STATE",
  "WEBRTC_OFFER", "WEBRTC_ANSWER", "WEBRTC_ICE", "WEBRTC_READY"
]);

async function relayRoomMessage(
  ws: ExtendedWebSocket,
  data: Record<string, unknown>,
  messageType: string
): Promise<void> {
  if (!ws.roomId || !ws.socketId) {
    return;
  }

  await roomManager.recordActivity(ws.roomId);

  const payload: Record<string, unknown> = {
    ...data,
    type: messageType,
    sender: ws.username ?? "Unknown",
    socketId: ws.socketId
  };

  if (messageType === "FILE_CONTENT" && data.targetSocketId) {
    sendToSocket(String(data.targetSocketId), payload);
    return;
  }

  if (messageType === "TUNNEL_REQUEST" && data.targetSocketId) {
    sendToSocket(String(data.targetSocketId), payload);
    return;
  }

  if (messageType === "TUNNEL_RESPONSE" && data.requesterId) {
    sendToSocket(String(data.requesterId), payload);
    return;
  }

  if (messageType.startsWith("WEBRTC_") && data.targetSocketId) {
    sendToSocket(String(data.targetSocketId), payload);
    return;
  }

  if (ws.roomId) {
    serverRecorder.record(ws.roomId, messageType, payload as Record<string, unknown>);
  }

  await publishRoomEvent({
    originNodeId: config.nodeId,
    roomId: ws.roomId,
    senderSocketId: ws.socketId,
    payload
  });
}

async function handleMessage(ws: ExtendedWebSocket, rawMessage: RawData): Promise<void> {
  const raw = rawMessage.toString();
  if (raw.length > MAX_MESSAGE_BYTES) {
    logger.warn("message_too_large", { socketId: ws.socketId, size: raw.length });
    return;
  }

  const socketKey = ws.socketId ?? "unknown";
  if (!rateLimiter.allow(socketKey)) {
    logger.warn("rate_limited", { socketId: ws.socketId });
    return;
  }

  const data = JSON.parse(raw) as Record<string, unknown>;
  const messageType = String(data.type ?? "UNKNOWN");

  if (authService.requiresAuth() && messageType !== "PING") {
    const token = String(data.authToken ?? data.token ?? "");
    const auth = await authService.validateToken(token);
    if (!auth.valid) {
      sendMessage(ws, { type: "AUTH_FAILED", error: "Invalid authentication token" });
      return;
    }
    if (auth.orgId) {
      (ws as ExtendedWebSocket & { orgId?: string }).orgId = auth.orgId;
    }
  }

  metrics.observeMessageReceived(messageType);

  switch (messageType) {
    case "CREATE_ROOM": {
      const adminName = String(data.adminName ?? "Admin");
      const roomKey = String(data.key ?? "");
      const roomName = String(data.roomName ?? "New Room");
      const socketId = ws.socketId ?? randomUUID();
      const requireApproval = data.requireApproval === true;
      const orgId = data.orgId ? String(data.orgId) : undefined;

      const room = await roomManager.createRoom(adminName, roomKey, roomName, socketId, requireApproval, orgId);
      ws.roomId = room.roomId;
      ws.username = adminName;

      serverRecorder.start(room.roomId);
      if (data.scheduledAt) {
        sessionScheduler.schedule({
          roomId: room.roomId,
          scheduledAt: Number(data.scheduledAt),
          expiresAt: Number(data.expiresAt ?? Date.now() + config.roomTtlMs),
          orgId,
          title: roomName
        });
      }

      await roomManager.addUser(socketId, adminName, room.roomId, "host");
      const users = await roomManager.listUsers(room.roomId);
      await refreshRoomMetric();

      auditLog.record({ action: "ROOM_CREATED", roomId: room.roomId, socketId, username: adminName });

      sendMessage(ws, { type: "ROOM_CREATED", room, socketId, isAdmin: true, users, role: "host" });

      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: room.roomId,
        senderSocketId: socketId,
        payload: { type: "USER_JOINED", socketId, username: adminName, users }
      });
      break;
    }

    case "JOIN_ROOM":
    case "REJOIN_ROOM": {
      const roomId = String(data.roomId ?? "");
      const securityKey = String(data.key ?? "");
      const userName = String(data.userName ?? "Guest");
      const socketId = ws.socketId ?? randomUUID();

      const joinResult = await roomManager.joinRoom(roomId, securityKey);
      if (!joinResult.success || !joinResult.room) {
        sendMessage(ws, { type: "JOIN_RESULT", ...joinResult, isAdmin: false });
        return;
      }

      const requireApproval = data.requireApproval === true;

      if (requireApproval && joinResult.room.adminId !== socketId) {
        roomManager.addPendingJoin(roomId, { socketId, username: userName, requestedAt: Date.now() });
        sendMessage(ws, { type: "JOIN_PENDING", roomId });
        sendToSocket(joinResult.room.adminId, {
          type: "JOIN_PENDING",
          socketId,
          userName,
          pending: roomManager.getPendingJoins(roomId)
        });
        auditLog.record({ action: "JOIN_REQUESTED", roomId, socketId, username: userName });
        return;
      }

      ws.roomId = roomId;
      ws.username = userName;

      const role = (data.role as import("./constants").UserRole) ??
        (joinResult.room.adminId === socketId ? "host" : "editor");
      await roomManager.addUser(socketId, userName, roomId, role);
      const users = await roomManager.listUsers(roomId);

      auditLog.record({ action: messageType, roomId, socketId, username: userName });

      sendMessage(ws, {
        type: "JOIN_RESULT",
        success: true,
        room: joinResult.room,
        socketId,
        isAdmin: joinResult.room.adminId === socketId,
        users,
        role
      });

      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId,
        senderSocketId: socketId,
        payload: { type: "USER_JOINED", socketId, username: userName, users }
      });
      break;
    }

    case "APPROVE_JOIN": {
      if (!ws.roomId || !ws.socketId) return;
      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) return;

      const targetSocketId = String(data.targetSocketId ?? "");
      const role = String(data.role ?? "editor") as import("./constants").UserRole;
      const pending = roomManager.removePendingJoin(ws.roomId, targetSocketId);
      if (!pending) return;

      await roomManager.addUser(targetSocketId, pending.username, ws.roomId, role);

      sendToSocket(targetSocketId, { type: "JOIN_APPROVED", roomId: ws.roomId, role });
      const users = await roomManager.listUsers(ws.roomId);

      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        senderSocketId: targetSocketId,
        payload: { type: "USER_JOINED", socketId: targetSocketId, username: pending.username, users }
      });

      auditLog.record({ action: "JOIN_APPROVED", roomId: ws.roomId, socketId: targetSocketId, username: pending.username, details: { role } });
      break;
    }

    case "DENY_JOIN": {
      if (!ws.roomId || !ws.socketId) return;
      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) return;

      const targetSocketId = String(data.targetSocketId ?? "");
      roomManager.removePendingJoin(ws.roomId, targetSocketId);
      sendToSocket(targetSocketId, { type: "JOIN_DENIED", roomId: ws.roomId });
      auditLog.record({ action: "JOIN_DENIED", roomId: ws.roomId, socketId: targetSocketId });
      break;
    }

    case "SET_ROLE": {
      if (!ws.roomId || !ws.socketId) return;
      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) return;

      const targetSocketId = String(data.targetSocketId ?? "");
      const role = String(data.role ?? "editor") as import("./constants").UserRole;
      roomManager.setUserRole(targetSocketId, role);

      sendToSocket(targetSocketId, { type: "ROLE_CHANGED", role });
      const users = await roomManager.listUsers(ws.roomId);
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        payload: { type: "USER_ROLE_CHANGED", users }
      });
      break;
    }

    case "FILE_REQUEST": {
      if (!ws.roomId || !ws.socketId) return;
      await relayRoomMessage(ws, {
        relativePath: String(data.relativePath ?? ""),
        requesterId: ws.socketId
      }, "FILE_REQUEST");
      break;
    }

    case "DEACTIVATE_ROOM": {
      if (!ws.roomId || !ws.socketId) return;
      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) return;

      await roomManager.startDeactivation(ws.roomId, Date.now() + config.deactivationMs);
      auditLog.record({ action: "DEACTIVATE_START", roomId: ws.roomId, socketId: ws.socketId });
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        payload: { type: "DEACTIVATION_START", duration: Math.floor(config.deactivationMs / 1000) }
      });
      break;
    }

    case "CANCEL_DEACTIVATION": {
      if (!ws.roomId || !ws.socketId) return;
      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) return;

      await roomManager.cancelDeactivation(ws.roomId);
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        payload: { type: "DEACTIVATION_CANCELLED" }
      });
      break;
    }

    case "ROTATE_KEY": {
      if (!ws.roomId || !ws.socketId) return;
      const room = await roomManager.getRoom(ws.roomId);
      if (!room || room.adminId !== ws.socketId) return;
      const newKey = String(data.newKey ?? "");
      if (!newKey) return;
      await roomManager.rotateKey(ws.roomId, newKey);
      auditLog.record({ action: "KEY_ROTATED", roomId: ws.roomId, socketId: ws.socketId });
      await publishRoomEvent({
        originNodeId: config.nodeId,
        roomId: ws.roomId,
        payload: { type: "KEY_ROTATED", newKey }
      });
      break;
    }

    case "SCHEDULE_SESSION": {
      if (!ws.roomId) return;
      sessionScheduler.schedule({
        roomId: ws.roomId,
        scheduledAt: Number(data.scheduledAt ?? Date.now()),
        expiresAt: Number(data.expiresAt ?? Date.now() + 3600000),
        title: String(data.title ?? "Scheduled Session")
      });
      sendMessage(ws, { type: "SESSION_SCHEDULED", schedules: sessionScheduler.list() });
      break;
    }

    case "PING": {
      sendMessage(ws, { type: "PONG", timestamp: Date.now() });
      break;
    }

    default: {
      if (RELAY_TYPES.has(messageType)) {
        await relayRoomMessage(ws, data, messageType);
        break;
      }
      logger.warn("unknown_message_type", { socketId: ws.socketId, type: messageType });
    }
  }
}

async function bootstrap(): Promise<void> {
  await stateStore.connect();
  await distributedBus.start(async (event) => {
    if (event.originNodeId === config.nodeId) return;
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

    sendMessage(socket, { type: "SERVER_INFO", version: SERVER_VERSION });

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
        logger.error("message_processing_failed", { error, socketId: socket.socketId });
      }
    });

    socket.on("error", (error) => {
      logger.warn("socket_error", { error, socketId: socket.socketId });
    });

    socket.on("close", async () => {
      metrics.setActiveConnections(wss.clients.size);
      rateLimiter.reset(socket.socketId ?? "");

      if (!socket.socketId) return;

      try {
        const removedUser = await roomManager.removeUser(socket.socketId);
        if (!removedUser) return;

        const users = await roomManager.listUsers(removedUser.roomId);
        auditLog.record({
          action: "USER_LEFT",
          roomId: removedUser.roomId,
          socketId: socket.socketId,
          username: socket.username
        });

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
        logger.error("socket_cleanup_failed", { error, socketId: socket.socketId });
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
      port: config.port,
      version: SERVER_VERSION
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
