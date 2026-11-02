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
                ORDER BY 
                    CASE WHEN city_name IS NOT NULL THEN 1 ELSE 0 END DESC,
                    CASE WHEN name IS NOT NULL THEN 1 ELSE 0 END DESC,
                    CASE WHEN phone_number IS NOT NULL THEN 1 ELSE 0 END DESC,
                    updated_at DESC
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
        const existing = await this.getByIdOrLid(cleanId);

        const baseId = cleanId.split('@')[0];
        const jid = `${baseId}@s.whatsapp.net`;
        const lid = `${baseId}@lid`;

        const linkedLid = existing?.lid ? existing.lid.split(':')[0] : null;
        const linkedPhone = existing?.phone_number ? existing.phone_number.split('@')[0].replace(/\D/g, '') : null;
        const linkedJid = linkedPhone ? `${linkedPhone}@s.whatsapp.net` : null;

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
                       OR ( ? IS NOT NULL AND (id = ? OR lid = ?) )
                       OR ( ? IS NOT NULL AND (id = ? OR phone_number = ?) )
                `;
                db.run(updateAltQuery, [
                    cityId, cityName, cityNameEn, cityCountdown, 
                    cleanId, cleanId, jid, lid,
                    linkedLid, linkedLid, linkedLid,
                    linkedPhone, linkedJid, linkedPhone
                ], function(uErr) {
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
        const existing = await this.getByIdOrLid(cleanId);

        const baseId = cleanId.split('@')[0];
        const jid = `${baseId}@s.whatsapp.net`;
        const lid = `${baseId}@lid`;

        const linkedLid = existing?.lid ? existing.lid.split(':')[0] : null;
        const linkedPhone = existing?.phone_number ? existing.phone_number.split('@')[0].replace(/\D/g, '') : null;
        const linkedJid = linkedPhone ? `${linkedPhone}@s.whatsapp.net` : null;

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

                    const updateContactsQuery = `
                        UPDATE contacts 
                        SET name = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ? OR lid = ? OR id = ? OR lid = ?
                           OR ( ? IS NOT NULL AND (id = ? OR lid = ?) )
                           OR ( ? IS NOT NULL AND (id = ? OR phone_number = ?) )
                    `;
                    db.run(updateContactsQuery, [
                        customName,
                        cleanId, cleanId, jid, lid,
                        linkedLid, linkedLid, linkedLid,
                        linkedPhone, linkedJid, linkedPhone
                    ], () => {});

                    const updateVotesQuery = `
                        UPDATE votes 
                        SET voter_name = ? 
                        WHERE voter_id = ? OR voter_id = ? OR voter_id = ?
                           OR ( ? IS NOT NULL AND voter_id = ? )
                           OR ( ? IS NOT NULL AND voter_id = ? )
                    `;
                    db.run(updateVotesQuery, [
                        customName, 
                        cleanId, jid, lid,
                        linkedLid, linkedLid,
                        linkedJid, linkedJid
                    ], function(vErr) {
                        if (vErr) return reject(vErr);
                        resolve({ id: cleanId, name: customName, votesUpdated: this.changes });
                    });
                });
            });
        });
    }

    async getAllContacts() {
        const db = this.getDb();
        return new Promise((resolve, reject) => {
            db.all(
                "SELECT id, lid, phone_number, name, notify, city_id, city_name, city_name_en, city_countdown FROM contacts",
                [],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                }
            );
        });
    }
}

module.exports = new ContactRepository();
module.exports.ContactRepository = ContactRepository;

