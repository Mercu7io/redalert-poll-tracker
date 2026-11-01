const whatsappService = require('../services/whatsappService');

class WhatsAppController {
    getStatus(req, res) {
        return res.json(whatsappService.getStatus());
    }

    async disconnect(req, res) {
        try {
            await whatsappService.disconnect();
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async getGroups(req, res) {
        const sock = whatsappService.getSocket();
        if (!whatsappService.isConnected || !sock) {
            return res.status(401).json({ error: 'WhatsApp client is offline' });
        }

        try {
            const groups = await sock.groupFetchAllParticipating();
            const mappedGroups = Object.values(groups).map(g => ({
                id: g.id,
                name: g.subject
            }));
            return res.json(mappedGroups);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async syncHistory(req, res) {
        const { groupId, pollId } = req.params;
        try {
            const result = await whatsappService.syncChatHistory(groupId, pollId);
            return res.json({ success: true, ...result });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new WhatsAppController();
module.exports.WhatsAppController = WhatsAppController;

