const { getDatabase } = require('../database/db');

class PollRepository {
    constructor(dbGetter = getDatabase) {
        this.getDb = dbGetter;
    }

    async create({ id, groupId, title, rawMessage }) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            const query = `INSERT OR IGNORE INTO polls (id, group_id, title, raw_message) VALUES (?, ?, ?, ?)`;
            db.run(query, [id, groupId, title, rawMessage], function(err) {
                if (err) return reject(err);
                resolve({ id, groupId, title, changes: this.changes });
            });
        });
    }

    async getById(id) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.get(`SELECT id, group_id, title, raw_message, timestamp FROM polls WHERE id = ?`, [id], (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }

    async getRawMessage(id) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.get(`SELECT raw_message FROM polls WHERE id = ?`, [id], (err, row) => {
                if (err) return reject(err);
                resolve(row?.raw_message || null);
            });
        });
    }

    async getTitle(id) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.get(`SELECT title FROM polls WHERE id = ?`, [id], (err, row) => {
                if (err) return reject(err);
                resolve(row?.title || null);
            });
        });
    }

    async getByGroupId(groupId, limit = 10) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT id, group_id, title, timestamp FROM polls WHERE group_id = ? ORDER BY timestamp DESC LIMIT ?`,
                [groupId, limit],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                }
            );
        });
    }
}

module.exports = new PollRepository();
module.exports.PollRepository = PollRepository;

