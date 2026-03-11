import sqlite3 from 'sqlite3';
import path from 'path';

// Path to the sqlite file
const dbPath = path.resolve(__dirname, '../../syncscript.sqlite');

const db = new sqlite3.Database(dbPath, (err: Error | null) => {
    if (err) {
        console.error('SQLite Connection Error:', err.message);
    } else {
        console.log('Connected to SyncScript SQLite database.');
    }
});

// Initialize Tables
db.serialize(() => {
    // Enable foreign keys to ensure ON DELETE CASCADE works
    db.run('PRAGMA foreign_keys = ON');

    /**
     * Rooms Table
     * UPDATED: 
     * - Added 'admin_id' to track who has permission to deactivate.
     * - Added 'last_activity' to support the 7-day auto-deactivation rule.
     */
    db.run(`
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            key TEXT NOT NULL,
            admin_id TEXT NOT NULL,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    /**
     * Users Table
     * Note: room_id references rooms(id). 
     * ON DELETE CASCADE ensures if a room is deactivated, users are cleaned up.
     */
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            socket_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            room_id TEXT,
            FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
        )
    `);
});

export default db;