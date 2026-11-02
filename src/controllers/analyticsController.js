const analyticsService = require('../services/analyticsService');

class AnalyticsController {
    async getSummary(req, res) {
        const { period = '24h', groupId = null } = req.query;
        try {
            const data = await analyticsService.getAnalytics({ period, groupId });
            return res.json(data);
        } catch (err) {
            console.error('[ANALYTICS] Error calculating crisis statistics:', err);
            return res.status(500).json({ error: `Failed to compute analytics: ${err.message}` });
        }
    }
}

module.exports = new AnalyticsController();
module.exports.AnalyticsController = AnalyticsController;

