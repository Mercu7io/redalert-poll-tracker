const whatsappService = require('../services/whatsappService');
const pollService = require('../services/pollService');
const pollRepository = require('../repositories/pollRepository');

class PollController {
    async createPoll(req, res) {
        const sock = whatsappService.getSocket();
        if (!whatsappService.isConnected || !sock) {
            return res.status(401).json({ error: 'WhatsApp client is offline' });
        }

        const { groupId, title, options, selectableCount = 1 } = req.body;

        try {
            await sock.sendMessage(groupId, {
                poll: {
                    name: title,
                    values: options,
                    selectableCount
                }
            });
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async getPollsByGroup(req, res) {
        try {
            const { groupId } = req.params;
            const polls = await pollRepository.getByGroupId(groupId, 10);
            return res.json(polls);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async getPollStats(req, res) {
        const sock = whatsappService.getSocket();
        if (!whatsappService.isConnected || !sock) {
            return res.status(401).json({ error: 'WhatsApp client is offline' });
        }

        const { groupId, pollId } = req.params;

        try {
            const data = await pollService.getPollStats({
                whatsappSocket: sock,
                groupId,
                pollId
            });
            return res.json(data);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async exportPollCsv(req, res) {
        const sock = whatsappService.getSocket();
        if (!whatsappService.isConnected || !sock) {
            return res.status(401).json({ error: 'WhatsApp client is offline' });
        }

        const { groupId, pollId } = req.params;

        try {
            const { stats } = await pollService.getPollStats({
                whatsappSocket: sock,
                groupId,
                pollId
            });

            const pollTitle = await pollRepository.getTitle(pollId) || 'sondage';
            const cleanTitle = pollTitle.replace(/[^a-zA-Z0-9_\-]/g, '_');
            const csvData = pollService.generateCsv(stats, pollTitle);

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="poll_${cleanTitle}_${Date.now()}.csv"`);
            return res.send(csvData);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async sendReminder(req, res) {
        const sock = whatsappService.getSocket();
        if (!whatsappService.isConnected || !sock) {
            return res.status(401).json({ error: 'WhatsApp client is offline' });
        }

        const { targetId, customMessage } = req.body;

        try {
            await sock.sendMessage(targetId, { text: customMessage });
            return res.json({ success: true });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    async sendBulkReminders(req, res) {
        const sock = whatsappService.getSocket();
        if (!whatsappService.isConnected || !sock) {
            return res.status(401).json({ error: 'WhatsApp client is offline' });
        }

        const { targetIds, customMessage, delayMs } = req.body;

        try {
            const results = await pollService.sendBulkReminders({
                whatsappSocket: sock,
                targetIds,
                customMessage,
                delayMs
            });
            const sentCount = results.filter(r => r.status === 'sent').length;
            return res.json({ success: true, sentCount, total: targetIds.length, results });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new PollController();
module.exports.PollController = PollController;

