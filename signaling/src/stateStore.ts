import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = path.join(__dirname, 'data', 'rooms.json');

export interface Room {
    roomId: string;
    securityKey: string;
    adminId: string;
    members: { id: string; name: string; lastSeen: number }[];
    fileStates: { [filePath: string]: string };
    createdAt: number;
    lastActivity: number;
}

export class StateStore {
    private rooms: Room[] = [];

    constructor() {
        this.load();
        this.startCleanupTimer();
    }

    private load() {
        if (fs.existsSync(DATA_PATH)) {
            const data = fs.readFileSync(DATA_PATH, 'utf8');
            this.rooms = JSON.parse(data || '[]');
        }
    }

    public save(rooms: Room[]) {
        this.rooms = rooms;
        fs.writeFileSync(DATA_PATH, JSON.stringify(this.rooms, null, 2));
    }

    public getRooms(): Room[] {
        return this.rooms;
    }

    private startCleanupTimer() {
        // Run once an hour to check for expired rooms
        setInterval(() => {
            const now = Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            const activeRooms = this.rooms.filter(r => (now - r.lastActivity) < sevenDays);
            
            if (activeRooms.length !== this.rooms.length) {
                console.log(`🧹 Cleaning up ${this.rooms.length - activeRooms.length} expired rooms.`);
                this.save(activeRooms);
            }
        }, 1000 * 60 * 60);
    }
}

module.exports = { StateStore};