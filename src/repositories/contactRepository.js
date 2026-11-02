const { getDatabase } = require('../database/db');

class ContactRepository {
    constructor(dbGetter = getDatabase) {
        this.getDb = dbGetter;
    }

    async upsertContact({ id, lid = null, phoneNumber = null, name = null, notify = null }) {
        if (!id) return;
        const db = this.getDb();
        const cleanId = id.split(':')[0];
        const cleanLid = lid ? lid.split(':')[0] : null;

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO contacts (id, lid, phone_number, name, notify, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    lid = COALESCE(excluded.lid, contacts.lid),
                    phone_number = COALESCE(excluded.phone_number, contacts.phone_number),
                    name = COALESCE(excluded.name, contacts.name),
                    notify = COALESCE(excluded.notify, contacts.notify),
                    updated_at = CURRENT_TIMESTAMP
            `;
            db.run(query, [cleanId, cleanLid, phoneNumber, name, notify], function(err) {
                if (err) return reject(err);
                resolve({ id: cleanId, changes: this.changes });
            });
        });
    }

    async bulkUpsert(contactsList) {
        if (!contactsList || !Array.isArray(contactsList) || contactsList.length === 0) return;
        const db = this.getDb();

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const stmt = db.prepare(`
                    INSERT INTO contacts (id, lid, phone_number, name, notify, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                        lid = COALESCE(excluded.lid, contacts.lid),
                        phone_number = COALESCE(excluded.phone_number, contacts.phone_number),
                        name = COALESCE(excluded.name, contacts.name),
                        notify = COALESCE(excluded.notify, contacts.notify),
                        updated_at = CURRENT_TIMESTAMP
                `);

                for (const c of contactsList) {
                    if (c && c.id) {
                        const cleanId = c.id.split(':')[0];
                        const cleanLid = c.lid ? c.lid.split(':')[0] : null;
                        stmt.run([cleanId, cleanLid, c.phoneNumber || null, c.name || null, c.notify || null]);
                    }
                }

                stmt.finalize((err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) return reject(commitErr);
                        resolve();
                    });
                });
            });
        });
    }

    async getByIdOrLid(identifier) {
        if (!identifier) return null;
        const db = this.getDb();
        const clean = identifier.split(':')[0];
        const base = clean.split('@')[0];
        const jid = `${base}@s.whatsapp.net`;
        const lid = `${base}@lid`;

        return new Promise((resolve, reject) => {
            const query = `
                SELECT id, lid, phone_number, name, notify, city_id, city_name, city_name_en, city_countdown 
                FROM contacts 
                WHERE id = ? OR lid = ? OR phone_number = ? OR id = ? OR lid = ?
                LIMIT 1
            `;
            db.get(query, [clean, clean, base, jid, lid], (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }

    async resolveBestName(identifier) {
        const contact = await this.getByIdOrLid(identifier);
        if (!contact) return null;
        return contact.name || contact.notify || null;
    }

    async updateContactCity(id, { cityId = null, cityName = null, cityNameEn = null, cityCountdown = null } = {}) {
        if (!id) return null;
        const db = this.getDb();
        const cleanId = id.split(':')[0];
        const baseId = cleanId.split('@')[0];
        const jid = `${baseId}@s.whatsapp.net`;
        const lid = `${baseId}@lid`;

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO contacts (id, city_id, city_name, city_name_en, city_countdown, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    city_id = excluded.city_id,
                    city_name = excluded.city_name,
                    city_name_en = excluded.city_name_en,
                    city_countdown = excluded.city_countdown,
                    updated_at = CURRENT_TIMESTAMP
            `;
            db.run(query, [cleanId, cityId, cityName, cityNameEn, cityCountdown], function(err) {
                if (err) return reject(err);
                const updateAltQuery = `
                    UPDATE contacts 
                    SET city_id = ?, city_name = ?, city_name_en = ?, city_countdown = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ? OR lid = ? OR id = ? OR lid = ?
                `;
                db.run(updateAltQuery, [cityId, cityName, cityNameEn, cityCountdown, cleanId, cleanId, jid, lid], function(uErr) {
                    if (uErr) return reject(uErr);
                    resolve({ id: cleanId, cityId, cityName, cityNameEn, cityCountdown });
                });
            });
        });
    }

    async updateCustomName(id, customName) {
        if (!id || !customName) return null;
        const db = this.getDb();
        const cleanId = id.split(':')[0];
        const baseId = cleanId.split('@')[0];
        const jid = `${baseId}@s.whatsapp.net`;
        const lid = `${baseId}@lid`;

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                const upsertContactQuery = `
                    INSERT INTO contacts (id, name, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        updated_at = CURRENT_TIMESTAMP
                `;
                db.run(upsertContactQuery, [cleanId, customName], (err) => {
                    if (err) return reject(err);

                    const updateVotesQuery = `
                        UPDATE votes 
                        SET voter_name = ? 
                        WHERE voter_id = ? OR voter_id = ? OR voter_id = ?
                    `;
                    db.run(updateVotesQuery, [customName, cleanId, jid, lid], function(vErr) {
                        if (vErr) return reject(vErr);
                        resolve({ id: cleanId, name: customName, votesUpdated: this.changes });
                    });
                });
            });
        });
    }
}

module.exports = new ContactRepository();
module.exports.ContactRepository = ContactRepository;

