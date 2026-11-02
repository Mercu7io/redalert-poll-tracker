const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { initDatabase, closeDatabase } = require('../src/database/db');

const { TzevaAdomService } = require('../src/services/tzevaAdomService');
const { CityService } = require('../src/services/cityService');
const contactCache = require('../src/services/contactCache');
const contactRepository = require('../src/repositories/contactRepository');
const voteRepository = require('../src/repositories/voteRepository');
const pollRepository = require('../src/repositories/pollRepository');
const pollService = require('../src/services/pollService');

describe('Crisis & Life-Safety Reliability Suite', () => {
    let mockAlertRepo;
    let cityService;
    let tzevaService;

    before(async () => {
        await initDatabase(':memory:');
    });

    after(async () => {
        await closeDatabase();
    });

    beforeEach(() => {
        mockAlertRepo = {
            saved: [],
            async saveAlert(a) { this.saved.push(a); },
            async getRecentAlerts() { return this.saved; }
        };
        cityService = new CityService();
        tzevaService = new TzevaAdomService({ alertRepo: mockAlertRepo, citySvc: cityService });
    });

    describe('TzevaAdom Multi-Alert Barrage & Array Payload Processing', () => {
        it('processes array payloads from Tzofar without dropping any alert during a barrage', async () => {
            const now = Math.floor(Date.now() / 1000);
            const barrage = [
                {
                    id: 'barrage-1',
                    cat: 1,
                    title: 'ירי רקטות וטילים',
                    data: ['אשקלון - צפון', 'אשקלון - דרום'],
                    timestamp: now
                },
                {
                    id: 'barrage-2',
                    cat: 2,
                    title: 'חדירת כלי טיס עוין',
                    data: ['חיפה - כרמל ועיר תחתית'],
                    timestamp: now
                }
            ];

            await tzevaService.processRawAlert(barrage);

            assert.equal(tzevaService.memoryAlerts.length, 2);
            assert.equal(mockAlertRepo.saved.length, 2);

            const ashkelonStatus = tzevaService.checkCityAlertStatus('אשקלון - דרום', 10);
            assert.equal(ashkelonStatus.hasAlert, true);
            assert.equal(ashkelonStatus.categoryKey, 'missiles');
            assert.equal(ashkelonStatus.icon, '🚀');

            const haifaStatus = tzevaService.checkCityAlertStatus('חיפה - כרמל ועיר תחתית', 10);
            assert.equal(haifaStatus.hasAlert, true);
            assert.equal(haifaStatus.categoryKey, 'drone');
            assert.equal(haifaStatus.icon, '🛸');
        });

        it('normalizes millisecond timestamps (> 1e11) to Unix seconds', async () => {
            const nowMs = Date.now();
            await tzevaService.processRawAlert({
                id: 'ms-alert',
                cat: 1,
                data: ['שדרות'],
                timestamp: nowMs // millisecond timestamp
            });

            const alert = tzevaService.memoryAlerts.find(a => a.id === 'ms-alert');
            assert.ok(alert);
            assert.ok(alert.timestamp < 1e11, 'Timestamp should be normalized to seconds');
            assert.equal(alert.timestamp, Math.floor(nowMs / 1000));
        });

        it('matches Hebrew city names despite hyphenation and whitespace variations', async () => {
            const now = Math.floor(Date.now() / 1000);
            await tzevaService.processRawAlert({
                id: 'tel-aviv-alert',
                cat: 1,
                title: 'ירי רקטות וטילים',
                data: ['תל-אביב'],
                timestamp: now
            });

            // Participant registered as "תל אביב - יפו" or "Tel Aviv - Yafo"
            const statusWithSpaces = tzevaService.checkCityAlertStatus('תל אביב', 10);
            assert.equal(statusWithSpaces.hasAlert, true, 'Should match תל-אביב with תל אביב');

            const statusFull = tzevaService.checkCityAlertStatus('תל אביב - יפו', 10);
            assert.equal(statusFull.hasAlert, true, 'Should match תל-אביב with תל אביב - יפו');
        });

        it('matches English city names despite hyphens or apostrophes', async () => {
            const now = Math.floor(Date.now() / 1000);
            await tzevaService.processRawAlert({
                id: 'beer-sheva-alert',
                cat: 1,
                title: 'Missile alert',
                cities: ['באר שבע - דרום'],
                timestamp: now
            });

            const status = tzevaService.checkCityAlertStatus("Be'er Sheva", 10);
            assert.equal(status.hasAlert, true, 'Should match Be\'er Sheva with באר שבע - דרום');
        });

        it('gracefully handles null, empty, or corrupt payloads', async () => {
            await tzevaService.processRawAlert(null);
            await tzevaService.processRawAlert(undefined);
            await tzevaService.processRawAlert({});
            await tzevaService.processRawAlert({ data: [] });
            assert.equal(tzevaService.memoryAlerts.length, 0);

            const status = tzevaService.checkCityAlertStatus(null);
            assert.equal(status.hasAlert, false);
            assert.equal(status.alert, null);
        });
    });

    describe('Identity Resilience & Cold-Start Memory Cache Hydration', () => {
        it('preloads contacts from database into ContactCache and builds bidirectional map', async () => {
            await contactRepository.upsertContact({
                id: '972509998877@s.whatsapp.net',
                lid: '778899001122@lid',
                phoneNumber: '972509998877',
                name: 'Rachel Levi'
            });

            contactCache.clear();
            assert.equal(contactCache.get('778899001122@lid'), undefined);

            await contactCache.preloadFromDatabase();

            assert.equal(contactCache.get('778899001122@lid'), 'Rachel Levi');
            assert.equal(contactCache.get('972509998877@s.whatsapp.net'), 'Rachel Levi');
            assert.equal(contactCache.lidMap.get('778899001122@lid'), '972509998877@s.whatsapp.net');
            assert.equal(contactCache.lidMap.get('972509998877@s.whatsapp.net'), '778899001122@lid');
        });

        it('matches voter with LID to group member with phone JID without identity loss', async () => {
            const fakePollId = 'POLL_CRISIS_TEST';
            const fakeGroupId = '120363000000000000@g.us';

            const mockBot = { id: '972500000000:1@s.whatsapp.net', lid: '9999999999:1@lid' };
            const mockSocket = {
                user: mockBot,
                groupMetadata: async () => ({
                    id: fakeGroupId,
                    participants: [
                        { id: '972540001122@s.whatsapp.net', name: 'Jonathan' }
                    ]
                })
            };

            await pollRepository.create({
                id: fakePollId,
                groupId: fakeGroupId,
                title: 'Emergency Check',
                rawMessage: JSON.stringify({
                    message: {
                        pollCreationMessage: {
                            name: 'Emergency Check',
                            options: [{ optionName: 'Safe' }, { optionName: 'Need Help' }]
                        }
                    }
                })
            });

            // Voter voted using their LID
            const voterLid = '884422110033@lid';
            const voterJid = '972540001122@s.whatsapp.net';

            // Seed contact with both identifiers & set city
            await contactRepository.upsertContact({
                id: voterJid,
                lid: voterLid,
                phoneNumber: '972540001122',
                name: 'Jonathan'
            });

            await contactRepository.updateContactCity(voterJid, {
                cityId: 511,
                cityName: 'אבו גוש',
                cityNameEn: 'Abu Gosh',
                cityCountdown: 90
            });

            contactCache.lidMap.set(voterLid, voterJid);
            contactCache.lidMap.set(voterJid, voterLid);

            await voteRepository.saveVote({
                pollId: fakePollId,
                voterId: voterLid,
                voterName: 'Jonathan',
                options: ['Safe']
            });

            const { stats } = await pollService.getPollStats({
                whatsappSocket: mockSocket,
                groupId: fakeGroupId,
                pollId: fakePollId
            });

            assert.equal(stats.length, 1);
            assert.equal(stats[0].hasVoted, true);
            assert.deepEqual(stats[0].options, ['Safe']);
            assert.equal(stats[0].cityNameEn, 'Abu Gosh');
            assert.equal(stats[0].cityCountdown, 90);
        });
    });
});
