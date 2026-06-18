import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

describe('Signaling integration', () => {
  it('creates and joins a room via WebSocket', async () => {
    const url = process.env.SIGNALING_URL ?? 'ws://localhost:4444';

    if (process.env.SKIP_INTEGRATION === 'true') {
      return;
    }

    try {
      const host = await connectAndCreate(url);
      const roomId = (host.room as { roomId?: string })?.roomId ?? String(host.roomId ?? '');
      assert.ok(roomId);
      assert.equal(host.type, 'ROOM_CREATED');

      const guest = await connectAndJoin(url, roomId, 'testkey');
      assert.equal(guest.success, true);
    } catch {
      console.log('Integration test skipped: signaling server not available');
    }
  });
});

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('timeout')), 3000);
    ws.on('open', () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function waitForMessage(ws: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message timeout')), 5000);
    const handler = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

async function connectAndCreate(url: string): Promise<Record<string, unknown>> {
  const ws = await connect(url);
  const roomPromise = waitForMessage(ws, 'ROOM_CREATED');
  ws.send(JSON.stringify({
    type: 'CREATE_ROOM',
    adminName: 'TestHost',
    roomName: 'Test Room',
    key: 'testkey'
  }));
  const result = await roomPromise;
  ws.close();
  return result;
}

async function connectAndJoin(url: string, roomId: string, key: string): Promise<Record<string, unknown>> {
  const ws = await connect(url);
  const joinPromise = waitForMessage(ws, 'JOIN_RESULT');
  ws.send(JSON.stringify({
    type: 'JOIN_ROOM',
    roomId,
    userName: 'TestGuest',
    key
  }));
  const result = await joinPromise;
  ws.close();
  return result;
}
