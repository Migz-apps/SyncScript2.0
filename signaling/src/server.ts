import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { RoomManager } from './roomManager';
import { SyncEngine } from './syncEngine';
import { RoomModel } from './models/roomModel';

// Custom interface to track room membership and identity on the socket object
interface ExtendedWebSocket extends WebSocket {
    socketId?: string;
    roomId?: string;
    username?: string;
}

const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    res.writeHead(200);
    res.end('SyncScript Signaling Server is running');
});

const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();
const syncEngine = new SyncEngine();

const port = 4444;

console.log(`🚀 SyncScript Signaling Server starting on port ${port}`);

wss.on('connection', (ws: ExtendedWebSocket) => {
    // Assign a unique ID to this connection session
    ws.socketId = Math.random().toString(36).substring(7);
    console.log(`New client connected: ${ws.socketId}`);

    ws.on('message', async (message: string) => {
        try {
            const data = JSON.parse(message);
            console.log('Received:', data.type);

            switch (data.type) {
                case 'CREATE_ROOM':
                    const newRoom = await roomManager.createRoom(data.adminName, data.key);
                    // Map identity to the socket instance
                    ws.roomId = newRoom.roomId;
                    ws.username = data.adminName;
                    
                    await RoomModel.addUser(ws.socketId!, data.adminName, newRoom.roomId);
                    
                    ws.send(JSON.stringify({ 
                        type: 'ROOM_CREATED', 
                        room: newRoom 
                    }));
                    break;

                case 'JOIN_ROOM':
                    const joinResult = await roomManager.joinRoom(data.roomId, data.key, data.userName);
                    if (joinResult.success) {
                        ws.roomId = data.roomId;
                        ws.username = data.userName;
                        await RoomModel.addUser(ws.socketId!, data.userName, data.roomId);
                    }
                    
                    ws.send(JSON.stringify({ 
                        type: 'JOIN_RESULT', 
                        ...joinResult 
                    }));
                    break;

                case 'FILE_CHANGE':
                    // Relay file changes to everyone else in the room
                    if (ws.roomId) {
                        syncEngine.broadcastToRoom(wss, ws.roomId, ws.socketId!, {
                            type: 'FILE_CHANGE',
                            fileUri: data.fileUri,
                            changes: data.changes,
                            sender: ws.username
                        });
                    }
                    break;

                case 'CAST_VOTE':
                    if (ws.roomId) {
                        // In a real scenario, you'd fetch total members from DB/RoomModel
                        // For now, we use a provided count or default
                        const result = syncEngine.registerVote(
                            data.fileId, 
                            ws.socketId!, 
                            data.choice, 
                            data.totalMembers || 2
                        );

                        if (result !== null) {
                            syncEngine.broadcastToRoom(wss, ws.roomId, '', {
                                type: 'VOTE_RESULT',
                                fileId: data.fileId,
                                approved: result
                            });
                        }
                    }
                    break;

                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (err) {
            console.error('Operation failed:', err);
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Internal Server Error' }));
        }
    });

    ws.on('close', async () => {
        console.log(`Client disconnected: ${ws.socketId}`);
        if (ws.socketId) {
            const roomId = await RoomModel.removeUser(ws.socketId);
            if (roomId) {
                // Notify remaining users
                syncEngine.broadcastToRoom(wss, roomId, ws.socketId, {
                    type: 'USER_LEFT',
                    socketId: ws.socketId,
                    username: ws.username
                });
            }
        }
    });
});

server.listen(port);