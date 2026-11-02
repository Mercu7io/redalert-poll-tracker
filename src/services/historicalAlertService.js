const alertRepository = require('../repositories/alertRepository');
const { CATEGORY_MAP } = require('./tzevaAdomService');

class HistoricalAlertService {
    constructor({ alertRepo = alertRepository, fetchFn = fetch } = {}) {
        this.alertRepo = alertRepo;
        this.fetch = fetchFn;
        this.historicalUrl = 'https://www.tzevaadom.co.il/static/historical/all.json';
    }

    async syncHistoricalAlerts(batchSize = 500) {
        console.log(`[HISTORICAL-ALERTS] Fetching national alert archive from ${this.historicalUrl}...`);
        const res = await this.fetch(this.historicalUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!res.ok) {
            throw new Error(`Failed to fetch historical alerts: HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
            throw new Error('Invalid format: expected array of alerts');
        }

        console.log(`[HISTORICAL-ALERTS] Downloaded ${data.length} records. Ingesting into database...`);

        let processedCount = 0;
        let batch = [];

        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            // Format in all.json: [id, cat, [cities], timestamp] or { id, cat, data, timestamp }
            let id, cat, cities, timestamp;

            if (Array.isArray(item)) {
                id = String(item[0]);
                cat = Number(item[1]);
                cities = Array.isArray(item[2]) ? item[2] : [];
                timestamp = Number(item[3]);
            } else if (item && typeof item === 'object') {
                id = String(item.id || item.notificationId || i);
                cat = Number(item.cat || item.categoryId || 1);
                cities = Array.isArray(item.data) ? item.data : (Array.isArray(item.cities) ? item.cities : []);
                timestamp = Number(item.timestamp);
            } else {
                continue;
            }

            // Normalization: in Tzofar historical data, 0 is Rockets/Missiles (category 1)
            const normalizedCategory = (cat === 0) ? 1 : (cat || 1);
            const categoryMeta = CATEGORY_MAP[normalizedCategory] || { en: 'Tzeva Adom Alert' };

            // Timestamp in seconds
            if (timestamp > 1e11) {
                timestamp = Math.floor(timestamp / 1000);
            }

            batch.push({
                id: `${id}_${timestamp}`,
                categoryId: normalizedCategory,
                categoryTitle: categoryMeta.en,
                cities,
                description: null,
                timestamp
            });

            if (batch.length >= batchSize) {
                await this.alertRepo.saveBatchAlerts(batch);
                processedCount += batch.length;
                batch = [];
            }
        }

        if (batch.length > 0) {
            await this.alertRepo.saveBatchAlerts(batch);
            processedCount += batch.length;
        }

        console.log(`[HISTORICAL-ALERTS] Successfully synchronized ${processedCount} alerts.`);
        const info = await this.alertRepo.getAlertsCount();

        return {
            syncedCount: processedCount,
            totalInDatabase: info.count,
            oldestTimestamp: info.oldestTimestamp,
            newestTimestamp: info.newestTimestamp
        };
    }

    async purgeOldAlerts(olderThanDays) {
        const days = Number(olderThanDays);
        if (!days || isNaN(days) || days < 1) {
            throw new Error('Invalid retention period: olderThanDays must be at least 1');
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const cutoffSeconds = nowSeconds - (days * 86400);

        const result = await this.alertRepo.purgeOldAlerts(cutoffSeconds);
        const info = await this.alertRepo.getAlertsCount();

        return {
            deletedCount: result.deletedCount,
            remainingCount: info.count,
            cutoffDate: new Date(cutoffSeconds * 1000).toISOString()
        };
    }

    async getHistoryInfo() {
        return await this.alertRepo.getAlertsCount();
    }
}

module.exports = new HistoricalAlertService();
module.exports.HistoricalAlertService = HistoricalAlertService;

