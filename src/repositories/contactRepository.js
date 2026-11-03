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
                db.run('BEGIN TRANSACTION', (beginErr) => {
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
                            db.run('ROLLBACK', () => reject(err));
                            return;
                        }
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr && !commitErr.message.includes('no transaction')) {
                                return reject(commitErr);
                            }
                            resolve();
                        });
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

    async saveContactGroupsBatch(contactIds, groupId) {
        if (!groupId || !Array.isArray(contactIds) || contactIds.length === 0) return 0;
        const db = this.getDb();

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION', () => {
                    const stmt = db.prepare(`
                        INSERT OR IGNORE INTO contact_groups (contact_id, group_id)
                        VALUES (?, ?)
                    `);

                    let count = 0;
                    for (const cid of contactIds) {
                        if (cid) {
                            const clean = String(cid).split(':')[0];
                            stmt.run([clean, groupId]);
                            count++;
                        }
                    }

                    stmt.finalize((err) => {
                        if (err) {
                            db.run('ROLLBACK', () => reject(err));
                            return;
                        }
                        db.run('COMMIT', (cErr) => {
                            if (cErr && !cErr.message.includes('no transaction')) {
                                return reject(cErr);
                            }
                            resolve(count);
                        });
                    });
                });
            });
        });
    }

    async getContactsByGroup({ groupId = null, search = null } = {}) {
        const db = this.getDb();
        const params = [];
        let query = `
            SELECT DISTINCT c.id, c.lid, c.phone_number, c.name, c.notify, c.city_id, c.city_name, c.city_name_en, c.city_countdown, c.updated_at
            FROM contacts c
        `;

        if (groupId && groupId !== 'all') {
            query += `
                INNER JOIN contact_groups cg ON (
                    c.id = cg.contact_id 
                    OR (c.lid IS NOT NULL AND c.lid = cg.contact_id)
                    OR (c.phone_number IS NOT NULL AND c.phone_number = cg.contact_id)
                    OR (c.phone_number IS NOT NULL AND (c.phone_number || '@s.whatsapp.net') = cg.contact_id)
                )
                WHERE cg.group_id = ?
            `;
            params.push(groupId);
        } else {
            query += ` WHERE 1=1 `;
        }

        if (search && typeof search === 'string' && search.trim()) {
            const cleanSearch = `%${search.trim().toLowerCase()}%`;
            query += `
                AND (
                    LOWER(COALESCE(c.name, '')) LIKE ?
                    OR LOWER(COALESCE(c.notify, '')) LIKE ?
                    OR LOWER(COALESCE(c.phone_number, '')) LIKE ?
                    OR LOWER(COALESCE(c.city_name, '')) LIKE ?
                    OR LOWER(COALESCE(c.city_name_en, '')) LIKE ?
                )
            `;
            params.push(cleanSearch, cleanSearch, cleanSearch, cleanSearch, cleanSearch);
        }

        query += `
            ORDER BY 
                CASE WHEN c.name IS NOT NULL THEN 1 ELSE 0 END DESC,
                COALESCE(c.name, c.notify, c.phone_number, c.id) ASC
        `;

        return new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) return reject(err);

                // Deduplicate in JS by canonical phone or LID
                const seen = new Set();
                const unique = [];

                for (const row of rows || []) {
                    const canonical = row.phone_number 
                        ? row.phone_number.split('@')[0].replace(/\D/g, '')
                        : (row.lid ? row.lid.split('@')[0] : row.id.split('@')[0]);

                    if (!seen.has(canonical)) {
                        seen.add(canonical);
                        unique.push(row);
                    }
                }

                resolve(unique);
            });
        });
    }

    async batchUpdateCity(contactIds, { cityId, cityName, cityNameEn, cityCountdown }) {
        if (!Array.isArray(contactIds) || contactIds.length === 0) return { updatedCount: 0 };
        let updatedCount = 0;
        for (const cid of contactIds) {
            await this.updateContactCity(cid, { cityId, cityName, cityNameEn, cityCountdown });
            updatedCount++;
        }
        return { updatedCount, cityId, cityName, cityNameEn, cityCountdown };
    }
}

module.exports = new ContactRepository();
module.exports.ContactRepository = ContactRepository;

