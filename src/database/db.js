const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const config = require('../config/env');

let dbInstance = null;

function initDatabase(customPath = null) {
    const targetPath = customPath || config.dbPath;
    
    if (targetPath !== ':memory:') {
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    const db = new sqlite3.Database(targetPath);

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('PRAGMA journal_mode = WAL;', (err) => {
                if (err && targetPath !== ':memory:') {
                    console.warn('Could not set WAL mode (might be memory db):', err.message);
                }
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS polls (
                    id TEXT PRIMARY KEY,
                    group_id TEXT,
                    title TEXT,
                    raw_message TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Safe ALTER in case existing table misses raw_message
            db.run(`ALTER TABLE polls ADD COLUMN raw_message TEXT`, () => {});

            db.run(`
                CREATE TABLE IF NOT EXISTS votes (
                    poll_id TEXT,
                    voter_id TEXT,
                    voter_name TEXT,
                    options TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (poll_id, voter_id)
                )
            `);

            // Safe ALTER in case existing table misses voter_name
            db.run(`ALTER TABLE votes ADD COLUMN voter_name TEXT`, () => {});

            db.run(`
                CREATE TABLE IF NOT EXISTS contacts (
                    id TEXT PRIMARY KEY,
                    lid TEXT,
                    phone_number TEXT,
                    name TEXT,
                    notify TEXT,
                    city_id INTEGER,
                    city_name TEXT,
                    city_name_en TEXT,
                    city_countdown INTEGER,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            // Safe ALTER in case existing table misses city columns
            db.run(`ALTER TABLE contacts ADD COLUMN city_id INTEGER`, () => {});
            db.run(`ALTER TABLE contacts ADD COLUMN city_name TEXT`, () => {});
            db.run(`ALTER TABLE contacts ADD COLUMN city_name_en TEXT`, () => {});
            db.run(`ALTER TABLE contacts ADD COLUMN city_countdown INTEGER`, () => {});

            db.run(`
                CREATE TABLE IF NOT EXISTS alerts_history (
                    id TEXT PRIMARY KEY,
                    category_id INTEGER NOT NULL,
                    category_title TEXT NOT NULL,
                    cities TEXT NOT NULL,
                    description TEXT,
                    timestamp INTEGER NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            db.run(`CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts_history(timestamp)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_lid ON contacts(lid)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number)`, (err) => {
                if (err) return reject(err);
                dbInstance = db;
                resolve(db);
            });
        });
    });
}

function getDatabase() {
    if (!dbInstance) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return dbInstance;
}

function closeDatabase() {
    return new Promise((resolve, reject) => {
        if (!dbInstance) return resolve();
        dbInstance.close((err) => {
            if (err) return reject(err);
            dbInstance = null;
            resolve();
        });
    });
}

module.exports = {
    initDatabase,
    getDatabase,
    closeDatabase
};

