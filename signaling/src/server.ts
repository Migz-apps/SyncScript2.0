import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import { RoomManager } from './roomManager';
import { SyncEngine } from './syncEngine';
import { RoomModel } from './models/roomModel';

const roomManager = new RoomManager();
const syncEngine = new SyncEngine();

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
const deactivationTimers = new Map<string, NodeJS.Timeout>();
const port = 4444;

wss.on('connection', (ws: ExtendedWebSocket) => {
    // Assign a unique ID to each connection
    ws.socketId = Math.random().toString(36).substring(7);
    
    ws.on('message', async (message: string) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'CREATE_ROOM': {
                    const adminName: string = data.adminName ?? 'Admin';
                    const roomKey: string = data.key ?? '';
                    const roomName: string = data.roomName ?? 'New Room';
                    const socketId = ws.socketId ?? '';

                    const newRoom = await roomManager.createRoom(
                        adminName, 
                        roomKey, 
                        roomName,
                        socketId
                    );

                    ws.roomId = newRoom.roomId;
                    ws.username = adminName;

                    await RoomModel.addUser(socketId, adminName, newRoom.roomId);
                    
                    ws.send(JSON.stringify({ 
                        type: 'ROOM_CREATED', 
                        room: newRoom,
                        isAdmin: true 
                    }));
                    break;
                }

                case 'JOIN_ROOM': {
                    const jRoomId: string = data.roomId ?? '';
                    const jKey: string = data.key ?? '';
                    const jUserName: string = data.userName ?? 'Guest';

                    const joinResult = await roomManager.joinRoom(jRoomId, jKey, jUserName);
                    if (joinResult.success) {
                        ws.roomId = jRoomId;
                        ws.username = jUserName;
                        if (ws.socketId) {
                            await RoomModel.addUser(ws.socketId, jUserName, jRoomId);
                        }
                    }
                    
                    const roomInfo = await RoomModel.getRoom(jRoomId);
                    const isAdmin = roomInfo && roomInfo.admin_id === ws.socketId;

                    ws.send(JSON.stringify({ 
                        type: 'JOIN_RESULT', 
                        ...joinResult,
                        isAdmin: !!isAdmin
                    }));
                    break;
                }

                case 'ARCH_SHARE': {
                    // Relay architecture to all other peers in the room
                    if (ws.roomId && ws.socketId) {
                        syncEngine.broadcastToRoom(wss, ws.roomId, ws.socketId, {
                            type: 'ARCH_SHARE',
                            manifest: data.manifest,
                            sender: ws.username
                        });
                        console.log(`[Server] Relayed architecture from ${ws.username}`);
                    }
                    break;
                }

                case 'FILE_CHANGE': {
                    if (ws.roomId && ws.socketId) {
                        await RoomModel.updateActivity(ws.roomId);
                        syncEngine.broadcastToRoom(wss, ws.roomId, ws.socketId, {
                            type: 'FILE_CHANGE',
                            fileUri: data.fileUri ?? '',
                            changes: data.changes ?? [],
                            sender: ws.username ?? 'Unknown'
                        });
                    }
                    break;
                }

                case 'DEACTIVATE_ROOM': {
                    if (!ws.roomId || !ws.socketId) return;
                    const room = await RoomModel.getRoom(ws.roomId);
                    if (room && room.admin_id === ws.socketId) {
                        syncEngine.broadcastToRoom(wss, ws.roomId, '', { 
                            type: 'DEACTIVATION_START', 
                            duration: 120 
                        });

                        const timer = setTimeout(async () => {
                            if (ws.roomId) {
                                await RoomModel.deleteRoom(ws.roomId);
                                syncEngine.broadcastToRoom(wss, ws.roomId, '', { type: 'ROOM_TERMINATED' });
                                deactivationTimers.delete(ws.roomId);
                            }
                        }, 120000);

                        deactivationTimers.set(ws.roomId, timer);
                    }
                    break;
                }

                case 'CANCEL_DEACTIVATION': {
                    if (!ws.roomId) return;
                    const room = await RoomModel.getRoom(ws.roomId);
                    if (room && room.admin_id === ws.socketId) {
                        const existingTimer = deactivationTimers.get(ws.roomId);
                        if (existingTimer) {
                            clearTimeout(existingTimer);
                            deactivationTimers.delete(ws.roomId);
                            syncEngine.broadcastToRoom(wss, ws.roomId, '', { type: 'DEACTIVATION_CANCELLED' });
                        }
                    }
                    break;
                }
            }
        } catch (err) {
            console.error('Operation failed:', err);
        }
    });

    ws.on('close', async () => {
        if (ws.socketId) {
            const roomId = await RoomModel.removeUser(ws.socketId);
            if (roomId) {
                syncEngine.broadcastToRoom(wss, roomId, ws.socketId, {
                    type: 'USER_LEFT',
                    socketId: ws.socketId,
                    username: ws.username ?? 'Unknown'
                });
            }
        }
    });
});

// Periodic cleanup of abandoned rooms
setInterval(async () => {
    try {
        await RoomModel.cleanInactiveRooms();
    } catch (err) {
        console.error('Cleanup failed:', err);
    }
}, 24 * 60 * 60 * 1000); 

server.listen(port, () => {
    console.log(`🚀 SyncScript Signaling Server running on port ${port}`);
});