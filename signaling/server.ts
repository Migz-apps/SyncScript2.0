import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
const { RoomManager } = require('./roomManager');
const { SyncEngine } = require('./syncEngine');

// Create a basic HTTP server to attach WebSocket to
const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    res.writeHead(200);
    res.end('SyncScript Signaling Server is running');
});

const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();
const syncEngine = new SyncEngine();

const port = 4444;

console.log(`🚀 SyncScript Signaling Server starting on port ${port}`);

wss.on('connection', (ws: WebSocket) => {
    console.log('New client connected');

    ws.on('message', (message: string) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data.type);

            switch (data.type) {
                case 'CREATE_ROOM':
                    const newRoom = roomManager.createRoom(data.adminName, data.key);
                    ws.send(JSON.stringify({ 
                        type: 'ROOM_CREATED', 
                        room: newRoom 
                    }));
                    break;

                case 'JOIN_ROOM':
                    const joinResult = roomManager.joinRoom(data.roomId, data.key, data.userName);
                    ws.send(JSON.stringify({ 
                        type: 'JOIN_RESULT', 
                        ...joinResult 
                    }));
                    break;

                case 'CAST_VOTE':
                    // We will implement the 120s voting logic here next
                    break;

                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (err) {
            console.error('Failed to parse message:', err);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

server.listen(port);