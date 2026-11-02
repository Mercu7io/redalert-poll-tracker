const historicalAlertService = require('../services/historicalAlertService');
const alertRepository = require('../repositories/alertRepository');
const tzevaAdomService = require('../services/tzevaAdomService');

class AlertController {
    async getRecentAlerts(req, res) {
        const { window = 60, windowMinutes } = req.query;
        try {
            const minutes = parseInt(windowMinutes || window || '60', 10);
            const alerts = tzevaAdomService.getRecentAlerts(minutes);
            return res.json(alerts);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async getHistoryInfo(req, res) {
        try {
            const info = await historicalAlertService.getHistoryInfo();
            return res.json(info);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async syncHistorical(req, res) {
        try {
            const result = await historicalAlertService.syncHistoricalAlerts();
            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[HISTORICAL] Sync error:', err);
            return res.status(500).json({ error: `Historical sync failed: ${err.message}` });
        }
    }

    async purgeAlerts(req, res) {
        const { olderThanDays } = req.body;
        try {
            const result = await historicalAlertService.purgeOldAlerts(olderThanDays);
            return res.json({ success: true, ...result });
        } catch (err) {
            console.error('[HISTORICAL] Purge error:', err);
            return res.status(400).json({ error: `Purge failed: ${err.message}` });
        }
    }
}

module.exports = new AlertController();
module.exports.AlertController = AlertController;
