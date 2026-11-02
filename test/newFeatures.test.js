const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { initDatabase, closeDatabase, getDatabase } = require('../src/database/db');

const contactRepository = require('../src/repositories/contactRepository');
const alertRepository = require('../src/repositories/alertRepository');
const { BackupService } = require('../src/services/backupService');
const { HistoricalAlertService } = require('../src/services/historicalAlertService');
const { AnalyticsService } = require('../src/services/analyticsService');

describe('New 2026 Features: Backup, Historical Alerts, Analytics & Directory', () => {
    let testDbPath;
    let backupService;

    before(async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-test-features-'));
        testDbPath = path.join(tempDir, 'test-sondages.db');
        await initDatabase(testDbPath);
        backupService = new BackupService({
            configRef: { dbPath: testDbPath, PORT: 3500, NODE_ENV: 'test', ALERT_LANGUAGE: 'en' },
            getDb: getDatabase
        });
    });

    after(async () => {
        await closeDatabase();
        try {
            if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
            const dir = path.dirname(testDbPath);
            if (fs.existsSync(dir)) fs.rmdirSync(dir);
        } catch {}
    });

    describe('Backup & Restore Service', () => {
        it('creates a valid .zip archive containing sondages.db, anonymized config, and metadata', async () => {
            // Seed a contact
            await contactRepository.upsertContact({
                id: '972501234567@s.whatsapp.net',
                name: 'Backup Test User',
                phoneNumber: '972501234567'
            });

            const { buffer, filename, size } = await backupService.createBackupZip();
            assert.ok(buffer);
            assert.ok(size > 0);
            assert.ok(filename.startsWith('backup-wa-tracker-'));
            assert.ok(filename.endsWith('.zip'));

            // Inspect zip contents
            const zip = new AdmZip(buffer);
            const dbEntry = zip.getEntry('sondages.db');
            const envEntry = zip.getEntry('config.env.anonymized');
            const metaEntry = zip.getEntry('metadata.json');

            assert.ok(dbEntry, 'Zip must contain sondages.db');
            assert.ok(envEntry, 'Zip must contain config.env.anonymized');
            assert.ok(metaEntry, 'Zip must contain metadata.json');

            const envText = envEntry.getData().toString('utf-8');
            assert.ok(envText.includes('***PROTECTED_DO_NOT_EXPORT***'), 'Secrets must be anonymized');
        });

        it('restores database from a valid zip archive successfully', async () => {
            const { buffer } = await backupService.createBackupZip();
            const result = await backupService.restoreBackupZip(buffer);
            assert.equal(result.success, true);

            // Verify contact still exists after restore
            const contact = await contactRepository.getByIdOrLid('972501234567@s.whatsapp.net');
            assert.ok(contact);
            assert.equal(contact.name, 'Backup Test User');
        });

        it('rejects corrupt or invalid zip archive (edge case)', async () => {
            // Zip without sondages.db
            const badZip = new AdmZip();
            badZip.addFile('random.txt', Buffer.from('hello'));
            const badBuffer = badZip.toBuffer();

            await assert.rejects(
                async () => await backupService.restoreBackupZip(badBuffer),
                /missing sondages\.db/
            );

            // Completely corrupt buffer
            await assert.rejects(
                async () => await backupService.restoreBackupZip(Buffer.from('not-a-zip')),
                /Invalid/
            );
        });
    });

    describe('Historical Alert Ingestion & Retention Purge', () => {
        let historicalService;

        beforeEach(() => {
            const mockFetch = async () => ({
                ok: true,
                json: async () => [
                    [101, 1, ['שדרות'], 1700000000],
                    [102, 2, ['חיפה - כרמל'], 1700000500],
                    [103, 0, ['אשקלון - דרום'], 1700001000]
                ]
            });

            historicalService = new HistoricalAlertService({
                alertRepo: alertRepository,
                fetchFn: mockFetch
            });
        });

        it('fetches and synchronizes Tzofar historical alert archive in batches', async () => {
            const result = await historicalService.syncHistoricalAlerts(10);
            assert.equal(result.syncedCount, 3);
            assert.ok(result.totalInDatabase >= 3);

            const alerts = await alertRepository.getRecentAlerts(0);
            assert.ok(alerts.some(a => a.id.startsWith('101_')));
            assert.ok(alerts.some(a => a.id.startsWith('102_')));
        });

        it('purges alerts older than specified days while retaining recent ones', async () => {
            const now = Math.floor(Date.now() / 1000);
            // Insert one very old alert (100 days ago) and one recent alert
            await alertRepository.saveAlert({
                id: 'ancient-alert',
                categoryId: 1,
                categoryTitle: 'Ancient Missile',
                cities: ['אשדוד'],
                timestamp: now - (100 * 86400)
            });

            await alertRepository.saveAlert({
                id: 'fresh-alert',
                categoryId: 1,
                categoryTitle: 'Recent Missile',
                cities: ['אשדוד'],
                timestamp: now - (2 * 86400)
            });

            const purgeRes = await historicalService.purgeOldAlerts(30); // purge > 30 days
            assert.ok(purgeRes.deletedCount >= 1);

            const recentAlerts = await alertRepository.getRecentAlerts(0);
            assert.ok(!recentAlerts.some(a => a.id === 'ancient-alert'), 'Ancient alert must be purged');
            assert.ok(recentAlerts.some(a => a.id === 'fresh-alert'), 'Fresh alert must be retained');
        });

        it('rejects invalid retention days <= 0 (edge case)', async () => {
            await assert.rejects(
                async () => await historicalService.purgeOldAlerts(0),
                /olderThanDays must be at least 1/
            );
        });
    });

    describe('Analytics Service (Alerts per City, Person, Period)', () => {
        let analyticsService;

        beforeEach(async () => {
            analyticsService = new AnalyticsService({
                alertRepo: alertRepository,
                contactRepo: contactRepository
            });

            // Seed contact with city
            await contactRepository.upsertContact({
                id: '972549991111@s.whatsapp.net',
                name: 'Exposed Member',
                phoneNumber: '972549991111'
            });
            await contactRepository.updateContactCity('972549991111@s.whatsapp.net', {
                cityId: 10,
                cityName: 'שדרות',
                cityNameEn: 'Sderot',
                cityCountdown: 15
            });

            // Seed alerts in Sderot in the last hour
            const now = Math.floor(Date.now() / 1000);
            await alertRepository.saveAlert({
                id: 'analytics-alert-1',
                categoryId: 1,
                categoryTitle: 'Rockets',
                cities: ['שדרות'],
                timestamp: now - 300
            });
            await alertRepository.saveAlert({
                id: 'analytics-alert-2',
                categoryId: 2,
                categoryTitle: 'Hostile Aircraft',
                cities: ['שדרות'],
                timestamp: now - 100
            });
        });

        it('computes crisis summary with top cities, threat categories and affected members', async () => {
            const summary = await analyticsService.getAnalytics({ period: '24h' });
            assert.ok(summary.totalAlerts >= 2);
            assert.ok(summary.topCities.length > 0);
            assert.ok(summary.topCities.some(c => c.cityName === 'שדרות'));

            assert.ok(summary.categoryBreakdown.length > 0);
            assert.ok(summary.memberImpact.length > 0);

            const exposed = summary.memberImpact.find(m => m.name === 'Exposed Member');
            assert.ok(exposed);
            assert.ok(exposed.alertsReceived >= 2);
            assert.equal(exposed.cityName, 'שדרות');
        });
    });

    describe('Contact Group Association & Batch City Update', () => {
        it('saves contact-group relationships and filters contacts by group', async () => {
            const groupId = 'group-cert-123@g.us';
            const user1 = '972501110001@s.whatsapp.net';
            const user2 = '972501110002@s.whatsapp.net';

            await contactRepository.upsertContact({ id: user1, name: 'Alice Group1', phoneNumber: '972501110001' });
            await contactRepository.upsertContact({ id: user2, name: 'Bob Group2', phoneNumber: '972501110002' });

            // Only Alice belongs to group-cert-123
            await contactRepository.saveContactGroupsBatch([user1], groupId);

            const groupContacts = await contactRepository.getContactsByGroup({ groupId });
            assert.equal(groupContacts.length, 1);
            assert.equal(groupContacts[0].name, 'Alice Group1');

            const allContacts = await contactRepository.getContactsByGroup({ groupId: 'all' });
            assert.ok(allContacts.length >= 2);
        });

        it('batch updates city for multiple contacts in one operation', async () => {
            const uA = '972507771111@s.whatsapp.net';
            const uB = '972507772222@s.whatsapp.net';

            await contactRepository.upsertContact({ id: uA, name: 'Batch A', phoneNumber: '972507771111' });
            await contactRepository.upsertContact({ id: uB, name: 'Batch B', phoneNumber: '972507772222' });

            const batchRes = await contactRepository.batchUpdateCity([uA, uB], {
                cityId: 1749,
                cityName: 'באר שבע - דרום',
                cityNameEn: 'Beer Sheva - South',
                cityCountdown: 60
            });

            assert.equal(batchRes.updatedCount, 2);

            const cA = await contactRepository.getByIdOrLid(uA);
            const cB = await contactRepository.getByIdOrLid(uB);

            assert.equal(cA.city_name_en, 'Beer Sheva - South');
            assert.equal(cB.city_name_en, 'Beer Sheva - South');
            assert.equal(cA.city_countdown, 60);
        });
    });
});
