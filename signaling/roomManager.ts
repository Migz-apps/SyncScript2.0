import { Room, StateStore } from './stateStore';
import { v4 as uuidv4 } from 'uuid';

export class RoomManager {
    private store: StateStore;

    constructor() {
        this.store = new StateStore();
    }

    public createRoom(adminName: string, securityKey: string): Room {
        const newRoom: Room = {
            roomId: uuidv4().substring(0, 8),
            securityKey: securityKey,
            adminId: uuidv4(),
            members: [{ id: uuidv4(), name: 'Admin', lastSeen: Date.now() }],
            fileStates: {},
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        const rooms = this.store.getRooms();
        rooms.push(newRoom);
        this.store.save(rooms);
        return newRoom;
    }

    public joinRoom(roomId: string, key: string, userName: string): { success: boolean; error?: string; room?: Room } {
        const rooms = this.store.getRooms();
        const room = rooms.find(r => r.roomId === roomId);

        if (!room) return { success: false, error: 'Room not found' };
        if (room.securityKey !== key) return { success: false, error: 'Invalid Security Key' };
        if (room.members.length >= 4) return { success: false, error: 'Room is full (Max 4)' };
        if (room.members.some(m => m.name === userName)) return { success: false, error: 'Name already taken' };

        room.members.push({ id: uuidv4(), name: userName, lastSeen: Date.now() });
        room.lastActivity = Date.now();
        this.store.save(rooms);
        
        return { success: true, room };
    }

    public deactivateRoom(roomId: string, requesterId: string): boolean {
        const rooms = this.store.getRooms();
        const index = rooms.findIndex(r => r.roomId === roomId && r.adminId === requesterId);
        
        if (index !== -1) {
            rooms.splice(index, 1);
            this.store.save(rooms);
            return true;
        }
        return false;
    }
}

module.exports = { RoomManager };