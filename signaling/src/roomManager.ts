import { v4 as uuidv4 } from 'uuid';
import { RoomModel } from './models/roomModel';

// Interface matching the logic used in server.ts
export interface Room {
    roomId: string;
    securityKey: string;
    createdAt: number;
    members?: any[]; // Members are now tracked via the 'users' table in SQLite
}

export class RoomManager {
    constructor() {
        // We no longer rely on a local this.store for the source of truth
    }

    /**
     * Creates a room in the SQLite database
     */
    public async createRoom(adminName: string, securityKey: string): Promise<Room> {
        const roomId = uuidv4().substring(0, 8);
        
        const newRoom: Room = {
            roomId: roomId,
            securityKey: securityKey,
            createdAt: Date.now()
        };

        // Persistent save to SQLite
        await RoomModel.createRoom(roomId, securityKey);
        
        console.log(`Room ${roomId} created by ${adminName}`);
        return newRoom;
    }

    /**
     * Validates and joins a room using database records
     */
    public async joinRoom(roomId: string, key: string, userName: string): Promise<{ success: boolean; error?: string; room?: Room }> {
        // Fetch room from SQLite
        const roomData = await RoomModel.getRoom(roomId);

        if (!roomData) {
            return { success: false, error: 'Room not found' };
        }

        // Validate Key (Note: SQLite column name is 'key')
        if (roomData.key !== key) {
            return { success: false, error: 'Invalid Security Key' };
        }

        // Return the room info. The actual User insertion into DB 
        // happens in server.ts upon successful join.
        return { 
            success: true, 
            room: {
                roomId: roomData.id,
                securityKey: roomData.key,
                createdAt: roomData.created_at
            } 
        };
    }

    /**
     * Explicitly deletes a room from the database
     */
    public async deactivateRoom(roomId: string): Promise<boolean> {
        try {
            await RoomModel.deleteRoom(roomId);
            return true;
        } catch (err) {
            console.error(`Failed to deactivate room ${roomId}:`, err);
            return false;
        }
    }
}

// Maintaining module.exports for your server.ts compatibility
module.exports = { RoomManager };