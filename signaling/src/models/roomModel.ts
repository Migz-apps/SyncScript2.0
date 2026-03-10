import db from '../db/database';

export class RoomModel {
    // Create a new room
    static createRoom(id: string, key: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const query = `INSERT INTO rooms (id, key) VALUES (?, ?)`;
            db.run(query, [id, key], (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Add user to a room
    static addUser(socketId: string, username: string, roomId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const query = `INSERT OR REPLACE INTO users (socket_id, username, room_id) VALUES (?, ?, ?)`;
            db.run(query, [socketId, username, roomId], (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Remove user and check if room should be deleted
    static removeUser(socketId: string): Promise<string | null> {
        return new Promise((resolve, reject) => {
            // Get the room ID before deleting the user
            db.get(`SELECT room_id FROM users WHERE socket_id = ?`, [socketId], (err: Error | null, row: any) => {
                if (err) return reject(err);
                if (!row) return resolve(null);

                const roomId = row.room_id;
                db.run(`DELETE FROM users WHERE socket_id = ?`, [socketId], (err: Error | null) => {
                    if (err) return reject(err);
                    
                    // Check if room is now empty
                    db.get(`SELECT COUNT(*) as count FROM users WHERE room_id = ?`, [roomId], (err: Error | null, result: any) => {
                        if (err) return reject(err);
                        if (result && result.count === 0) {
                            this.deleteRoom(roomId);
                        }
                        resolve(roomId);
                    });
                });
            });
        });
    }

    // Delete room (Deactivation)
    static deleteRoom(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM rooms WHERE id = ?`, [id], (err: Error | null) => {
                if (err) reject(err);
                else {
                    console.log(`Room ${id} deactivated and deleted.`);
                    resolve();
                }
            });
        });
    }

    // Verify room key
    static getRoom(id: string): Promise<any> {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM rooms WHERE id = ?`, [id], (err: Error | null, row: any) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}