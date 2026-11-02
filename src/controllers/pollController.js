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
        const alertWindowMinutes = parseInt(req.query.alertWindow || '10', 10);

        try {
            const data = await pollService.getPollStats({
                whatsappSocket: sock,
                groupId,
                pollId,
                alertWindowMinutes
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
            let textToSend = customMessage;
            if (customMessage && customMessage.includes('[Name]')) {
                const contactRepo = require('../repositories/contactRepository');
                const contactCache = require('../services/contactCache');
                let memberName = await contactRepo.resolveBestName(targetId);
                if (!memberName) {
                    memberName = contactCache.get(targetId) || '';
                }
                if (memberName) {
                    textToSend = customMessage.replace(/\[Name\]/g, memberName);
                } else {
                    textToSend = customMessage.replace(/\s*\[Name\]\s*/g, ' ').replace(/\s+([,!?.:;])/g, '$1');
                }
                textToSend = textToSend.replace(/\s{2,}/g, ' ').trim();
            }

            await sock.sendMessage(targetId, { text: textToSend });
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

        const { targetIds, targets, customMessage, delayMs } = req.body;

        try {
            const results = await pollService.sendBulkReminders({
                whatsappSocket: sock,
                targetIds,
                targets,
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

