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
}

module.exports = new AlertRepository();
module.exports.AlertRepository = AlertRepository;
