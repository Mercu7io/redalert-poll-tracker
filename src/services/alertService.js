const config = require('../config/env');
const contactCache = require('./contactCache');
const pollRepository = require('../repositories/pollRepository');

class AlertService {
    isHelpOption(options) {
        if (!options || !Array.isArray(options)) return false;
        const alertKeywords = ['help', 'aide', 'secours', 'urgent', 'sos'];
        return options.some(opt => {
            if (!opt) return false;
            const lower = String(opt).toLowerCase();
            return alertKeywords.some(keyword => lower.includes(keyword));
        });
    }

    formatAlertMessage({ voterName, pollTitle, options, lang = 'en' }) {
        const titleDisplay = pollTitle ? `"${pollTitle}"` : (lang === 'fr' ? "un sondage récent" : "a recent poll");
        if (lang === 'fr') {
            return `🚨 *ALERTE D'URGENCE* 🚨\n\n*${voterName}* a sélectionné une option d'aide dans ${titleDisplay} !\n\nOptions choisies: ${options.join(', ')}\nMerci de vérifier immédiatement.`;
        }
        return `🚨 *URGENT ALERT* 🚨\n\n*${voterName}* selected a help option in ${titleDisplay}!\n\nSelected options: ${options.join(', ')}\nPlease check immediately.`;
    }

    async handleVoteAlert({ socket, pollId, voterId, options }) {
        if (!socket || !this.isHelpOption(options)) return false;

        try {
            const voterName = contactCache.get(voterId) || `+${voterId.split('@')[0]}`;
            const pollTitle = await pollRepository.getTitle(pollId);
            const alertMsg = this.formatAlertMessage({
                voterName,
                pollTitle,
                options,
                lang: config.ALERT_LANGUAGE || 'en'
            });

            let recipient = null;
            if (config.ALERT_TARGET_NUMBER) {
                recipient = config.ALERT_TARGET_NUMBER.includes('@') 
                    ? config.ALERT_TARGET_NUMBER 
                    : `${config.ALERT_TARGET_NUMBER}@s.whatsapp.net`;
            } else if (socket.user && socket.user.id) {
                recipient = socket.user.id.split(':')[0] + '@s.whatsapp.net';
            }

            if (recipient) {
                await socket.sendMessage(recipient, { text: alertMsg });
                console.log(`[ALERT] Notification envoyée avec succès à ${recipient} pour ${voterName}`);
                return true;
            }
        } catch (err) {
            console.error('[ALERT] Erreur lors de l\'envoi de l\'alerte:', err.message);
        }
        return false;
    }
}

module.exports = new AlertService();
module.exports.AlertService = AlertService;

