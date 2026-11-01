const { getDatabase } = require('../database/db');

class VoteRepository {
    constructor(dbGetter = getDatabase) {
        this.getDb = dbGetter;
    }

    async saveVote({ pollId, voterId, voterName = null, options }) {
        const db = this.getDb();
        const optionsStr = typeof options === 'string' ? options : JSON.stringify(options);
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO votes (poll_id, voter_id, voter_name, options, timestamp)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(poll_id, voter_id) DO UPDATE SET
                    voter_name = COALESCE(excluded.voter_name, votes.voter_name),
                    options = excluded.options,
                    timestamp = CURRENT_TIMESTAMP
            `;
            db.run(query, [pollId, voterId, voterName, optionsStr], function(err) {
                if (err) return reject(err);
                resolve({ pollId, voterId, voterName, options: optionsStr, changes: this.changes });
            });
        });
    }

    async getVotesByPollId(pollId) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT voter_id, voter_name, options, timestamp FROM votes WHERE poll_id = ?`,
                [pollId],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                }
            );
        });
    }

    async getVote(pollId, voterId) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT voter_id, voter_name, options, timestamp FROM votes WHERE poll_id = ? AND voter_id = ?`,
                [pollId, voterId],
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row || null);
                }
            );
        });
    }
}

module.exports = new VoteRepository();
module.exports.VoteRepository = VoteRepository;
