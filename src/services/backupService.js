const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/env');
const { getDatabase, closeDatabase, initDatabase } = require('../database/db');
const contactCache = require('./contactCache');

class BackupService {
    constructor({ configRef = config, getDb = getDatabase } = {}) {
        this.config = configRef;
        this.getDb = getDb;
    }

    async createBackupZip() {
        const db = this.getDb();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-backup-'));
        const tempDbPath = path.join(tempDir, 'backup.db');

        try {
            // 1. Safe atomic snapshot using SQLite VACUUM INTO
            await new Promise((resolve, reject) => {
                db.run(`VACUUM INTO ?`, [tempDbPath], (err) => {
                    if (err) {
                        // Fallback: If VACUUM INTO fails (e.g. in-memory or older sqlite), copy file directly
                        try {
                            if (fs.existsSync(this.config.dbPath)) {
                                fs.copyFileSync(this.config.dbPath, tempDbPath);
                                return resolve();
                            }
                        } catch (copyErr) {
                            return reject(err);
                        }
                        return reject(err);
                    }
                    resolve();
                });
            });

            // 2. Anonymized config (.env)
            let anonymizedEnv = `# WhatsApp Poll Tracker Configuration (Anonymized Backup)\n`;
            anonymizedEnv += `# Created at: ${new Date().toISOString()}\n\n`;
            anonymizedEnv += `PORT=${this.config.PORT || 3500}\n`;
            anonymizedEnv += `NODE_ENV=${this.config.NODE_ENV || 'production'}\n`;
            anonymizedEnv += `DATABASE_PATH=data/sondages.db\n`;
            anonymizedEnv += `ALERT_LANGUAGE=${this.config.ALERT_LANGUAGE || 'en'}\n`;
            anonymizedEnv += `APP_PASSWORD=***PROTECTED_DO_NOT_EXPORT***\n`;

            // 3. Metadata
            const metadata = {
                app: 'wa-poll-tracker',
                version: '1.2.0',
                backupDate: new Date().toISOString(),
                database: 'SQLite3',
                format: 'sondages-backup-v1'
            };

            // 4. Bundle into Zip
            const zip = new AdmZip();
            zip.addLocalFile(tempDbPath, '', 'sondages.db');
            zip.addFile('config.env.anonymized', Buffer.from(anonymizedEnv, 'utf-8'));
            zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8'));

            const zipBuffer = zip.toBuffer();
            const filename = `backup-wa-tracker-${timestamp}.zip`;

            return {
                buffer: zipBuffer,
                filename,
                size: zipBuffer.length
            };
        } finally {
            // Clean up temporary files
            try {
                if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
                if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
            } catch {}
        }
    }

    async restoreBackupZip(zipBuffer) {
        if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
            throw new Error('Invalid or empty zip file provided');
        }

        const zip = new AdmZip(zipBuffer);
        const dbEntry = zip.getEntry('sondages.db');
        if (!dbEntry) {
            throw new Error('Invalid backup archive: missing sondages.db inside zip');
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-restore-'));
        const tempDbPath = path.join(tempDir, 'restore-test.db');

        try {
            // Write to temporary location and test SQLite integrity
            fs.writeFileSync(tempDbPath, dbEntry.getData());

            const isIntegrityOk = await new Promise((resolve) => {
                const testDb = new sqlite3.Database(tempDbPath, sqlite3.OPEN_READONLY, (err) => {
                    if (err) return resolve(false);
                    testDb.get('PRAGMA integrity_check', (checkErr, row) => {
                        testDb.close();
                        if (checkErr || !row || row.integrity_check !== 'ok') {
                            return resolve(false);
                        }
                        resolve(true);
                    });
                });
            });

            if (!isIntegrityOk) {
                throw new Error('Database integrity check failed on uploaded backup');
            }

            // Close existing DB
            await closeDatabase();

            // Replace actual dbPath
            const targetPath = this.config.dbPath;
            if (targetPath && targetPath !== ':memory:') {
                const targetDir = path.dirname(targetPath);
                if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
                fs.copyFileSync(tempDbPath, targetPath);
            }

            // Re-open DB and reload cache
            await initDatabase(targetPath);
            await contactCache.preloadFromDatabase();

            return {
                success: true,
                message: 'Backup restored successfully'
            };
        } finally {
            try {
                if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
                if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
            } catch {}
        }
    }
}

module.exports = new BackupService();
module.exports.BackupService = BackupService;

