const analyticsService = require('../services/analyticsService');

class AnalyticsController {
    async getSummary(req, res) {
        const { period = '24h', groupId = null, memberSearch = null } = req.query;
        try {
            const data = await analyticsService.getAnalytics({ period, groupId, memberSearch });
            return res.json(data);
        } catch (err) {
            console.error('[ANALYTICS] Error calculating crisis statistics:', err);
            return res.status(500).json({ error: `Failed to compute analytics: ${err.message}` });
        }
    }

    async getMemberStats(req, res) {
        const { identifier = null, search = null } = req.query;
        try {
            const data = await analyticsService.getMemberAnalytics({ identifier, search });
            if (!data.found) {
                return res.status(404).json({ error: 'Member not found', ...data });
            }
            return res.json(data);
        } catch (err) {
            console.error('[ANALYTICS] Error calculating member statistics:', err);
            return res.status(500).json({ error: `Failed to compute member analytics: ${err.message}` });
        }
    }
}

module.exports = new AnalyticsController();
module.exports.AnalyticsController = AnalyticsController;

