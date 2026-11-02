const cityService = require('../services/cityService');
const tzevaAdomService = require('../services/tzevaAdomService');

class CityController {
    searchCities(req, res) {
        try {
            const query = req.query.q || '';
            const results = cityService.search(query, 25);
            return res.json(results);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    getRecentAlerts(req, res) {
        try {
            const windowMinutes = parseInt(req.query.window || '60', 10);
            const alerts = tzevaAdomService.getRecentAlerts(windowMinutes);
            return res.json(alerts);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new CityController();
module.exports.CityController = CityController;

