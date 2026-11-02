const contactRepository = require('../repositories/contactRepository');
const contactCache = require('../services/contactCache');

class ContactController {
    async updateContactName(req, res) {
        const { id, customName } = req.body;
        try {
            const updated = await contactRepository.updateCustomName(id, customName);
            contactCache.set(id, customName);
            return res.json({ success: true, contact: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async updateContactCity(req, res) {
        const { id, cityId, cityName, cityNameEn, cityCountdown } = req.body;
        try {
            const updated = await contactRepository.updateContactCity(id, {
                cityId: cityId ? String(cityId) : null,
                cityName: cityName || null,
                cityNameEn: cityNameEn || null,
                cityCountdown: (cityCountdown !== undefined && cityCountdown !== null && cityCountdown !== '') ? Number(cityCountdown) : null
            });
            return res.json({ success: true, contact: updated });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new ContactController();
module.exports.ContactController = ContactController;

