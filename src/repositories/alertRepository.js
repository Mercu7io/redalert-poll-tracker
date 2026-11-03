const { getDatabase } = require('../database/db');

class AlertRepository {
    constructor(dbGetter = getDatabase) {
        this.getDb = dbGetter;
    }

    async saveAlert({ id, categoryId, categoryTitle, cities, description = null, timestamp }) {
        if (!id) return;
        const db = this.getDb();
        const citiesJson = Array.isArray(cities) ? JSON.stringify(cities) : (typeof cities === 'string' ? cities : '[]');

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO alerts_history (id, category_id, category_title, cities, description, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    category_id = excluded.category_id,
                    category_title = excluded.category_title,
                    cities = excluded.cities,
                    description = excluded.description,
                    timestamp = excluded.timestamp
            `;
            db.run(query, [String(id), Number(categoryId) || 0, categoryTitle || 'Alert', citiesJson, description, Number(timestamp)], function(err) {
                if (err) return reject(err);
                resolve({ id, changes: this.changes });
            });
        });
    }

    async getRecentAlerts(sinceTimestamp = 0) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            const query = `
                SELECT id, category_id, category_title, cities, description, timestamp, created_at
                FROM alerts_history
                WHERE timestamp >= ?
                ORDER BY timestamp DESC
            `;
            db.all(query, [Number(sinceTimestamp)], (err, rows) => {
                if (err) return reject(err);
                const mapped = (rows || []).map(r => {
                    let parsedCities = [];
                    try {
                        parsedCities = JSON.parse(r.cities);
                    } catch {
                        parsedCities = [];
                    }
                    return {
                        id: r.id,
                        categoryId: r.category_id,
                        categoryTitle: r.category_title,
                        cities: parsedCities,
                        description: r.description,
                        timestamp: r.timestamp,
                        createdAt: r.created_at
                    };
                });
                resolve(mapped);
            });
        });
    }

    async getAlertsInWindow(fromTimestamp, toTimestamp) {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            const query = `
                SELECT id, category_id, category_title, cities, description, timestamp, created_at
                FROM alerts_history
                WHERE timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp DESC
            `;
            db.all(query, [Number(fromTimestamp), Number(toTimestamp)], (err, rows) => {
                if (err) return reject(err);
                const mapped = (rows || []).map(r => {
                    let parsedCities = [];
                    try {
                        parsedCities = JSON.parse(r.cities);
                    } catch {
                        parsedCities = [];
                    }
                    return {
                        id: r.id,
                        categoryId: r.category_id,
                        categoryTitle: r.category_title,
                        cities: parsedCities,
                        description: r.description,
                        timestamp: r.timestamp,
                        createdAt: r.created_at
                    };
                });
                resolve(mapped);
            });
        });
    }

    async getAlertsForCity(cityName, sinceTimestamp = 0) {
        if (!cityName) return [];
        const alerts = await this.getRecentAlerts(sinceTimestamp);
        const cleanTarget = cityName.trim().toLowerCase();

        return alerts.filter(a => {
            return (a.cities || []).some(c => {
                const cleanCity = String(c).trim().toLowerCase();
                return cleanCity === cleanTarget || cleanCity.includes(cleanTarget) || cleanTarget.includes(cleanCity);
            });
        });
    }

    async saveBatchAlerts(alertsList) {
        if (!Array.isArray(alertsList) || alertsList.length === 0) return 0;
        const db = this.getDb();

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION', (beginErr) => {
                    if (beginErr) {
                        // If transaction is already active, proceed without nested BEGIN
                    }

                    const stmt = db.prepare(`
                        INSERT INTO alerts_history (id, category_id, category_title, cities, description, timestamp)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            category_id = excluded.category_id,
                            category_title = excluded.category_title,
                            cities = excluded.cities,
                            description = COALESCE(excluded.description, alerts_history.description),
                            timestamp = excluded.timestamp
                    `);

                    let insertedCount = 0;
                    for (const a of alertsList) {
                        if (a && a.id) {
                            const citiesJson = Array.isArray(a.cities) ? JSON.stringify(a.cities) : (typeof a.cities === 'string' ? a.cities : '[]');
                            stmt.run([
                                String(a.id),
                                Number(a.categoryId || a.cat || 1),
                                a.categoryTitle || a.title || 'Alert',
                                citiesJson,
                                a.description || a.desc || null,
                                Number(a.timestamp)
                            ]);
                            insertedCount++;
                        }
                    }

                    stmt.finalize((err) => {
                        if (err) {
                            db.run('ROLLBACK', () => reject(err));
                            return;
                        }
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr && !commitErr.message.includes('no transaction')) {
                                return reject(commitErr);
                            }
                            resolve(insertedCount);
                        });
                    });
                });
            });
        });
    }

    async purgeOldAlerts(beforeTimestamp) {
        const db = this.getDb();
        const cutoff = Number(beforeTimestamp);
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM alerts_history WHERE timestamp < ?`, [cutoff], function(err) {
                if (err) return reject(err);
                resolve({ deletedCount: this.changes, cutoffTimestamp: cutoff });
            });
        });
    }

    async getAlertsCount() {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count, MIN(timestamp) as oldest, MAX(timestamp) as newest FROM alerts_history`, [], (err, row) => {
                if (err) return reject(err);
                resolve({
                    count: row?.count || 0,
                    oldestTimestamp: row?.oldest || null,
                    newestTimestamp: row?.newest || null
                });
            });
        });
    }
}

module.exports = new AlertRepository();
module.exports.AlertRepository = AlertRepository;

