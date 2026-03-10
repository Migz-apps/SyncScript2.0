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

    // Rooms Table
    db.run(`
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Users Table
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