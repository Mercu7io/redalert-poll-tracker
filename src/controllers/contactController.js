const contactRepository = require('../repositories/contactRepository');
const contactCache = require('../services/contactCache');
const whatsappService = require('../services/whatsappService');

class ContactController {
    async getContacts(req, res) {
        const { groupId = 'all', search = '' } = req.query;
        try {
            if (groupId && groupId !== 'all') {
                try {
                    const participants = await whatsappService.getGroupParticipants(groupId);
                    if (participants && participants.length > 0) {
                        const ids = participants.map(p => p.id || p.lid).filter(Boolean);
                        await contactRepository.saveContactGroupsBatch(ids, groupId);
                        const toHydrate = [];
                        for (const p of participants) {
                            if (p.id) {
                                toHydrate.push({
                                    id: p.id.split(':')[0],
                                    lid: p.lid ? p.lid.split(':')[0] : null,
                                    phoneNumber: p.phoneNumber || (p.id.includes('@s.whatsapp.net') ? p.id.split('@')[0] : null),
                                    name: p.name || null,
                                    notify: p.notify || null
                                });
                            }
                        }
                        contactCache.hydrate(toHydrate);
                    }
                } catch {}
            }

            const contacts = await contactRepository.getContactsByGroup({ groupId, search });
            return res.json({ contacts, count: contacts.length });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

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

    async batchUpdateCity(req, res) {
        const { contactIds, cityId, cityName, cityNameEn, cityCountdown } = req.body;
        try {
            const result = await contactRepository.batchUpdateCity(contactIds, {
                cityId: cityId ? String(cityId) : null,
                cityName: cityName || null,
                cityNameEn: cityNameEn || null,
                cityCountdown: (cityCountdown !== undefined && cityCountdown !== null && cityCountdown !== '') ? Number(cityCountdown) : null
            });
            return res.json({ success: true, ...result });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new ContactController();
module.exports.ContactController = ContactController;


