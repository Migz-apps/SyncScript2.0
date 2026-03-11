import { v4 as uuidv4 } from 'uuid';
import { RoomModel } from './models/roomModel';

// Interface updated to include roomName and adminId
export interface Room {
    roomId: string;
    roomName: string; 
    securityKey: string;
    adminId: string; // Added field to track persistent admin
    createdAt: number;
    members?: any[]; 
}

export class RoomManager {
    constructor() {}
    
    /**
     * UPDATED: Now accepts 4 arguments to include adminId
     */
    public async createRoom(
        adminName: string, 
        securityKey: string, 
        roomName: string, 
        adminId: string // The 4th argument from server.ts
    ): Promise<Room> {
        
        // Generate a 8-character unique ID
        const roomId = uuidv4().substring(0, 8);
        
        const newRoom: Room = {
            roomId: roomId,
            roomName: roomName,
            securityKey: securityKey,
            adminId: adminId,
            createdAt: Date.now()
        };

        // Persistent save to SQLite 
        // Ensure RoomModel.createRoom is updated to store adminId
        await RoomModel.createRoom(roomId, securityKey, roomName, adminId);
        
        console.log(`Room "${roomName}" (${roomId}) created by ${adminName} (ID: ${adminId})`);
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

        // Validate Key
        if (roomData.key !== key) {
            return { success: false, error: 'Invalid Security Key' };
        }

        // Return the room info mapping DB columns to the Room interface
        return { 
            success: true, 
            room: {
                roomId: roomData.id,
                roomName: roomData.name || 'Unnamed Room',
                securityKey: roomData.key,
                adminId: roomData.admin_id, // Ensure this maps to your DB column name
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

export default RoomManager;