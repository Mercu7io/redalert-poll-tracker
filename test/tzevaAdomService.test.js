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

    it('correctly maps Tzofar category 5 to drone (NOT tsunami) and resolves Hebrew titles', async () => {
        const { resolveCategory } = require('../src/services/tzevaAdomService');

        // Tzofar cat 5 is drone
        const cat5 = resolveCategory(5, '');
        assert.equal(cat5.key, 'drone');
        assert.equal(cat5.icon, '🛸');

        // Tzofar cat 0 is missiles
        const cat0 = resolveCategory(0, '');
        assert.equal(cat0.key, 'missiles');
        assert.equal(cat0.icon, '🚀');

        // Real tsunami only when code 9 or title contains tsunami
        const tsunamiByCode = resolveCategory(9, '');
        assert.equal(tsunamiByCode.key, 'tsunami');
        assert.equal(tsunamiByCode.icon, '🌊');

        const tsunamiByTitle = resolveCategory(1, 'חשש לצונאמי');
        assert.equal(tsunamiByTitle.key, 'tsunami');
        assert.equal(tsunamiByTitle.icon, '🌊');

        // Edge case: completely unknown code falls back gracefully
        const unknown = resolveCategory(999, 'Test Alert');
        assert.equal(unknown.key, 'general');
        assert.equal(unknown.icon, '⚠️');
    });

    it('evaluates alert window around poll timestamp (both before and after poll)', async () => {
        const mockRepo = { saveAlert: async () => {} };
        const mockCitySvc = {
            getCityByName: (name) => ({ id: 100, name: 'חיפה', nameEn: 'Haifa', countdown: 60 })
        };
        const service = new TzevaAdomService({ alertRepo: mockRepo, citySvc: mockCitySvc });

        const pollTime = 1700000000;

        // Alert 1: occurred 5 minutes BEFORE the poll
        await service.processRawAlert({
            id: 'before-poll-alert',
            cat: 5, // drone
            title: 'חדירת כלי טיס עוין',
            data: ['חיפה'],
            timestamp: pollTime - 300 // 5 min before
        });

        // Checking with 10 min window around pollTime -> should find alert
        const resBefore = service.checkCityAlertStatus('Haifa', 10, pollTime);
        assert.equal(resBefore.hasAlert, true);
        assert.equal(resBefore.categoryKey, 'drone');
        assert.equal(resBefore.icon, '🛸');

        // Alert 2: occurred 5 minutes AFTER the poll
        await service.processRawAlert({
            id: 'after-poll-alert',
            cat: 1, // missiles
            title: 'ירי רקטות וטילים',
            data: ['חיפה'],
            timestamp: pollTime + 300 // 5 min after
        });

        const resAfter = service.checkCityAlertStatus('Haifa', 10, pollTime);
        assert.equal(resAfter.hasAlert, true);

        // Edge case: alert occurred 25 minutes before poll -> outside 10 min window
        const oldPollTime = pollTime + 1800; // 30 min later
        const resOutside = service.checkCityAlertStatus('Haifa', 10, oldPollTime);
        assert.equal(resOutside.hasAlert, false);

        // Integration with customAlertsList (e.g. alerts retrieved from SQLite database)
        const customAlerts = [{
            id: 'sqlite-alert-1',
            categoryId: 1,
            categoryTitle: 'Rockets & Missiles',
            cities: ['חיפה'],
            timestamp: oldPollTime - 120 // 2 min before oldPollTime
        }];
        const resFromSqlite = service.checkCityAlertStatus('Haifa', 10, oldPollTime, customAlerts);
        assert.equal(resFromSqlite.hasAlert, true);
        assert.equal(resFromSqlite.alert.id, 'sqlite-alert-1');
    });
});

