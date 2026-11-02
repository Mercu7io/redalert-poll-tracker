const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TzevaAdomService } = require('../src/services/tzevaAdomService');

describe('TzevaAdomService', () => {
    it('processes raw alert and detects alert within window', async () => {
        const mockRepo = {
            savedAlerts: [],
            saveAlert: async (data) => {
                mockRepo.savedAlerts.push(data);
            }
        };

        const mockCitySvc = {
            getCityByName: (name) => {
                if (name === 'Ashkelon - South' || name === 'אשקלון - דרום') {
                    return { id: 1932, name: 'אשקלון - דרום', nameEn: 'Ashkelon - South', countdown: 30 };
                }
                return null;
            }
        };

        const service = new TzevaAdomService({ alertRepo: mockRepo, citySvc: mockCitySvc });

        const nowSec = Math.floor(Date.now() / 1000);
        await service.processRawAlert({
            id: 'test-123',
            cat: 1,
            title: 'ירי רקטות וטילים',
            data: ['אשקלון - דרום'],
            desc: 'היכנסו למרחב המוגן',
            timestamp: nowSec - 120 // 2 minutes ago
        });

        assert.equal(mockRepo.savedAlerts.length, 1);

        // Check with 10 minute window -> should find alert
        const status = service.checkCityAlertStatus('Ashkelon - South', 10);
        assert.equal(status.hasAlert, true);
        assert.ok(status.alert);
        assert.equal(status.alert.categoryKey, 'missiles');
        assert.equal(status.alert.categoryIcon, '🚀');
        assert.equal(status.alert.countdown, 30);
        assert.ok(status.alert.minutesAgo >= 1 && status.alert.minutesAgo <= 3);

        // Check with 1 minute window -> alert was 2 min ago, should be false
        const statusNarrow = service.checkCityAlertStatus('Ashkelon - South', 1);
        assert.equal(statusNarrow.hasAlert, false);
    });

    it('returns false for cities without alerts (edge case)', () => {
        const service = new TzevaAdomService({
            alertRepo: { saveAlert: async () => {} },
            citySvc: { getCityByName: () => null }
        });

        const status = service.checkCityAlertStatus('Safe City', 10);
        assert.equal(status.hasAlert, false);
        assert.equal(status.alert, null);

        const statusNull = service.checkCityAlertStatus(null);
        assert.equal(statusNull.hasAlert, false);
    });
});

