const backupService = require('../services/backupService');

class BackupController {
    async downloadBackup(req, res) {
        try {
            const { buffer, filename } = await backupService.createBackupZip();
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buffer.length);
            return res.send(buffer);
        } catch (err) {
            console.error('[BACKUP] Error creating backup zip:', err);
            return res.status(500).json({ error: `Failed to create backup: ${err.message}` });
        }
    }

    async restoreBackup(req, res) {
        try {
            // Buffer can be passed via body directly or multipart raw
            let zipBuffer = null;
            if (Buffer.isBuffer(req.body)) {
                zipBuffer = req.body;
            } else if (req.body && req.body.zipBase64) {
                zipBuffer = Buffer.from(req.body.zipBase64, 'base64');
            } else {
                return res.status(400).json({ error: 'No zip archive provided. Send raw binary or zipBase64 field.' });
            }

            const result = await backupService.restoreBackupZip(zipBuffer);
            return res.json(result);
        } catch (err) {
            console.error('[BACKUP] Error restoring backup zip:', err);
            return res.status(400).json({ error: `Failed to restore backup: ${err.message}` });
        }
    }
}

module.exports = new BackupController();
module.exports.BackupController = BackupController;

