import db from '../db/database';

export class RoomModel {
    /**
     * Optional: Call this on server start to ensure the schema is correct.
     * Ensures rooms table has admin_id and last_activity columns.
     */
    static initializeTable(): Promise<void> {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Create Rooms table with correct columns
                db.run(`CREATE TABLE IF NOT EXISTS rooms (
                    id TEXT PRIMARY KEY,
                    key TEXT,
                    name TEXT,
                    admin_id TEXT,
                    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => { if (err) reject(err); });

                // Create Users table
                db.run(`CREATE TABLE IF NOT EXISTS users (
                    socket_id TEXT PRIMARY KEY,
                    username TEXT,
                    room_id TEXT,
                    FOREIGN KEY(room_id) REFERENCES rooms(id)
                )`, (err) => { 
                    if (err) reject(err); 
                    else resolve();
                });
            });
        });
    }

    /**
     * Create a new room with a name, security key, and admin identifier
     */
    static createRoom(id: string, key: string, name: string, adminId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO rooms (id, key, name, admin_id, last_activity) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`;
            db.run(query, [id, key, name, adminId], (err: Error | null) => {
                if (err) {
                    console.error("DB Error creating room:", err.message);
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Add user to a room and refresh the room's activity timestamp
     */
    static addUser(socketId: string, username: string, roomId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const query = `INSERT OR REPLACE INTO users (socket_id, username, room_id) VALUES (?, ?, ?)`;
            db.run(query, [socketId, username, roomId], async (err: Error | null) => {
                if (err) {
                    reject(err);
                } else {
                    try {
                        await this.updateActivity(roomId);
                        resolve();
                    } catch (activityErr) {
                        reject(activityErr);
                    }
                }
            });
        });
    }

    /**
     * Updates the last_activity timestamp for the 7-day auto-deactivation rule
     */
    static updateActivity(roomId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE rooms SET last_activity = CURRENT_TIMESTAMP WHERE id = ?`, [roomId], (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Remove user from the database
     */
    static removeUser(socketId: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            db.get(`SELECT room_id FROM users WHERE socket_id = ?`, [socketId], (err: Error | null, row: any) => {
                if (err) return reject(err);
                if (!row) return resolve(null);

                const roomId = row.room_id;
                db.run(`DELETE FROM users WHERE socket_id = ?`, [socketId], (err: Error | null) => {
                    if (err) return reject(err);
                    resolve(roomId);
                });
            });
        });
    }

    /**
     * Explicitly delete room (Used by Admin Deactivation or Cleanup Task)
     */
    static deleteRoom(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // We must delete users in that room first to maintain integrity
            db.run(`DELETE FROM users WHERE room_id = ?`, [id], (err) => {
                if (err) return reject(err);
                db.run(`DELETE FROM rooms WHERE id = ?`, [id], (err: Error | null) => {
                    if (err) reject(err);
                    else {
                        console.log(`Room ${id} has been deactivated and removed.`);
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Fetch room details including the admin_id for permission checks
     */
    static getRoom(id: string): Promise<any> {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM rooms WHERE id = ?`, [id], (err: Error | null, row: any) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Find and delete rooms that have had no activity for 7 days
     */
    static cleanInactiveRooms(): Promise<number> {
        return new Promise((resolve, reject) => {
            // First, find which rooms are expired
            const findExpired = `SELECT id FROM rooms WHERE last_activity < datetime('now', '-7 days')`;
            db.all(findExpired, [], async (err, rows: any[]) => {
                if (err) return reject(err);
                
                let deletedCount = 0;
                for (const row of rows) {
                    await this.deleteRoom(row.id);
                    deletedCount++;
                }
                resolve(deletedCount);
            });
        });
    }
}