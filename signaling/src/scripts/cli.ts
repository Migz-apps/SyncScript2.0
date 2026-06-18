#!/usr/bin/env node
/**
 * SyncScript CLI — create or list collaboration rooms from the terminal.
 * Usage:
 *   node dist/scripts/cli.js create --name "Team Room" --key secret
 *   node dist/scripts/cli.js list
 */
import { WebSocket } from 'ws';

const SIGNALING_URL = process.env.SIGNALING_URL ?? 'ws://localhost:4444';
const args = process.argv.slice(2);
const command = args[0];

function sendAndWait(socket: WebSocket, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
    const handler = (raw: Buffer) => {
      clearTimeout(timeout);
      socket.off('message', handler);
      resolve(JSON.parse(raw.toString()) as Record<string, unknown>);
    };
    socket.on('message', handler);
    socket.send(JSON.stringify(payload));
  });
}

async function createRoom(name: string, key: string): Promise<void> {
  const socket = new WebSocket(SIGNALING_URL);
  await new Promise<void>((resolve, reject) => {
    socket.on('open', () => resolve());
    socket.on('error', reject);
  });

  const response = await sendAndWait(socket, {
    type: 'CREATE_ROOM',
    adminName: 'CLI',
    roomName: name,
    key
  });

  console.log(JSON.stringify(response, null, 2));
  socket.close();
}

async function main(): Promise<void> {
  if (command === 'create') {
    const nameIdx = args.indexOf('--name');
    const keyIdx = args.indexOf('--key');
    const name = nameIdx >= 0 ? args[nameIdx + 1] : 'CLI Room';
    const key = keyIdx >= 0 ? args[keyIdx + 1] : 'syncscript';
    await createRoom(name, key);
    return;
  }

  if (command === 'health') {
    const httpUrl = SIGNALING_URL.replace(/^ws/, 'http');
    const res = await fetch(httpUrl);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`SyncScript CLI
Commands:
  create --name <name> --key <password>   Create a room
  health                                  Check server health
Environment:
  SIGNALING_URL=${SIGNALING_URL}`);
}

void main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
