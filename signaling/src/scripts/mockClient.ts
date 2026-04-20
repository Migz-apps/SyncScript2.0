import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { setTimeout as delay } from "timers/promises";
import { WebSocket } from "ws";

interface RoomFile {
  roomId: string;
  key: string;
}

const signalingUrl = process.env.SIGNALING_URL ?? "ws://signaling:4444";
const clientMode = process.env.CLIENT_MODE ?? "host";
const roomName = process.env.ROOM_NAME ?? "Compose Test Room";
const roomKey = process.env.ROOM_KEY ?? "syncscript";
const username = process.env.USERNAME ?? (clientMode === "host" ? "Host" : "Guest");
const roomFile = process.env.ROOM_FILE ?? "/shared/room.json";
const exitAfterMs = Number(process.env.EXIT_AFTER_MS ?? "15000");
const fileUri = process.env.MOCK_FILE_URI ?? "file:///workspace/mock.txt";

function log(message: string, details?: unknown): void {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  process.stdout.write(`[mock:${clientMode}] ${message}${payload}\n`);
}

function writeRoomFile(payload: RoomFile): void {
  mkdirSync(dirname(roomFile), { recursive: true });
  writeFileSync(roomFile, JSON.stringify(payload, null, 2), "utf8");
}

async function waitForRoomFile(): Promise<RoomFile> {
  while (true) {
    try {
      return JSON.parse(readFileSync(roomFile, "utf8")) as RoomFile;
    } catch {
      await delay(500);
    }
  }
}

async function startClient(): Promise<void> {
  const socket = new WebSocket(signalingUrl);

  socket.on("open", async () => {
    log("connected", { signalingUrl });

    if (clientMode === "host") {
      socket.send(
        JSON.stringify({
          type: "CREATE_ROOM",
          adminName: username,
          roomName,
          key: roomKey
        })
      );
      return;
    }

    const room = await waitForRoomFile();
    socket.send(
      JSON.stringify({
        type: "JOIN_ROOM",
        roomId: room.roomId,
        userName: username,
        key: room.key
      })
    );
  });

  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as Record<string, unknown>;
    log("message", message);

    if (clientMode === "host" && message.type === "ROOM_CREATED") {
      const room = message.room as { roomId: string };
      writeRoomFile({
        roomId: room.roomId,
        key: roomKey
      });

      socket.send(
        JSON.stringify({
          type: "ARCH_SHARE",
          manifest: ["src/server.ts", "src/socketManager.ts"]
        })
      );
    }

    if (clientMode === "guest" && message.type === "JOIN_RESULT" && message.success) {
      socket.send(
        JSON.stringify({
          type: "FILE_CHANGE",
          fileUri,
          changes: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
              },
              text: "// compose smoke-test\n"
            }
          ]
        })
      );
    }
  });

  socket.on("close", () => {
    log("closed");
  });

  socket.on("error", (error) => {
    log("error", { message: error.message });
  });

  await delay(exitAfterMs);
  socket.close();
}

void startClient().catch((error) => {
  log("fatal", { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
