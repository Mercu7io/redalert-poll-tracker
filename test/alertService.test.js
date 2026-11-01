const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const alertService = require('../src/services/alertService');

describe('AlertService', () => {
    it('detects emergency options containing "help", "aide", "sos", or "secours"', () => {
        assert.equal(alertService.isHelpOption(['Need help immediately']), true);
        assert.equal(alertService.isHelpOption(['Besoin d\'aide']), true);
        assert.equal(alertService.isHelpOption(['Demande de secours']), true);
        assert.equal(alertService.isHelpOption(['SOS']), true);
    });

    it('returns false for benign responses (edge case)', () => {
        assert.equal(alertService.isHelpOption(['Yes']), false);
        assert.equal(alertService.isHelpOption(['All safe']), false);
        assert.equal(alertService.isHelpOption(['No siren heard']), false);
        assert.equal(alertService.isHelpOption([]), false);
        assert.equal(alertService.isHelpOption(null), false);
    });

    it('formats alert messages in English by default', () => {
        const msg = alertService.formatAlertMessage({
            voterName: 'John Doe',
            pollTitle: '[01/11/2026 - 22:58] - Are you all safe?',
            options: ['Need help'],
            lang: 'en'
        });

        assert.ok(msg.includes("🚨 *URGENT ALERT* 🚨"));
        assert.ok(msg.includes('*John Doe* selected a help option in "[01/11/2026 - 22:58] - Are you all safe?"!'));
        assert.ok(msg.includes('Selected options: Need help'));
        assert.ok(msg.includes('Please check immediately.'));
    });

    it('formats alert messages in French when requested', () => {
        const msg = alertService.formatAlertMessage({
            voterName: 'John Doe',
            pollTitle: 'Sécurité',
            options: ['Besoin d\'aide'],
            lang: 'fr'
        });

        assert.ok(msg.includes("🚨 *ALERTE D'URGENCE* 🚨"));
        assert.ok(msg.includes("a sélectionné une option d'aide"));
        assert.ok(msg.includes('Merci de vérifier immédiatement.'));
    });
});
