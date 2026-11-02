const contactRepository = require('../repositories/contactRepository');

class ContactCache {
    constructor(max = 5000) {
        this.max = max;
        this.cache = new Map();
        this.lidMap = new Map(); // Maps LID to Phone / ID
    }

    get(key) {
        if (!key) return undefined;
        const clean = key.split(':')[0];
        
        if (this.cache.has(clean)) {
            const val = this.cache.get(clean);
            this.cache.delete(clean);
            this.cache.set(clean, val);
            return val;
        }

        // Try lookup via LID map
        if (this.lidMap.has(clean)) {
            const mappedId = this.lidMap.get(clean);
            if (this.cache.has(mappedId)) {
                return this.cache.get(mappedId);
            }
        }

        const base = clean.split('@')[0];
        if (this.cache.has(base)) {
            return this.cache.get(base);
        }

        return undefined;
    }

    set(key, val, extra = {}) {
        if (!key || !val) return;
        const cleanKey = key.split(':')[0];

        if (this.cache.has(cleanKey)) {
            this.cache.delete(cleanKey);
        } else if (this.cache.size >= this.max) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(cleanKey, val);

        const base = cleanKey.split('@')[0];
        this.cache.set(base, val);

        if (extra.lid) {
            const cleanLid = extra.lid.split(':')[0];
            this.lidMap.set(cleanLid, cleanKey);
            this.lidMap.set(cleanKey, cleanLid); // Bidirectional mapping
            this.cache.set(cleanLid, val);
        }

        // Asynchronously persist to database without blocking
        contactRepository.upsertContact({
            id: cleanKey,
            lid: extra.lid || null,
            phoneNumber: extra.phoneNumber || (cleanKey.includes('@s.whatsapp.net') ? base : null),
            name: extra.name || null,
            notify: val
        }).catch(() => {});
    }

    hydrate(contacts) {
        if (!contacts || !Array.isArray(contacts)) return;
        const toPersist = [];

        for (const contact of contacts) {
            if (contact && contact.id) {
                const id = contact.id.split(':')[0];
                const name = contact.name || contact.notify || contact.verifiedName;
                const lid = contact.lid ? contact.lid.split(':')[0] : null;

                if (name) {
                    this.set(id, name, { lid, phoneNumber: contact.phoneNumber, name: contact.name });
                } else if (lid) {
                    this.lidMap.set(lid, id);
                    this.lidMap.set(id, lid);
                }

                toPersist.push({
                    id,
                    lid,
                    phoneNumber: contact.phoneNumber,
                    name: contact.name,
                    notify: contact.notify || contact.verifiedName
                });
            }
        }

        if (toPersist.length > 0) {
            contactRepository.bulkUpsert(toPersist).catch(() => {});
        }
    }

    async preloadFromDatabase() {
        try {
            const rows = await contactRepository.getAllContacts();
            for (const row of rows) {
                if (!row || !row.id) continue;
                const cleanId = row.id.split(':')[0];
                const name = row.name || row.notify;
                if (name) {
                    this.cache.set(cleanId, name);
                    this.cache.set(cleanId.split('@')[0], name);
                }
                if (row.lid) {
                    const cleanLid = row.lid.split(':')[0];
                    this.lidMap.set(cleanLid, cleanId);
                    this.lidMap.set(cleanId, cleanLid);
                    if (name) this.cache.set(cleanLid, name);
                }
                if (row.phone_number) {
                    const cleanPhone = row.phone_number.split('@')[0].replace(/\D/g, '');
                    const phoneJid = `${cleanPhone}@s.whatsapp.net`;
                    if (row.lid) {
                        const cleanLid = row.lid.split(':')[0];
                        this.lidMap.set(cleanLid, phoneJid);
                        this.lidMap.set(phoneJid, cleanLid);
                    }
                    if (cleanId.includes('@lid')) {
                        this.lidMap.set(cleanId, phoneJid);
                        this.lidMap.set(phoneJid, cleanId);
                    }
                }
            }
            console.log(`[CONTACT-CACHE] Preloaded ${rows.length} contacts from database into memory cache`);
        } catch (err) {
            console.warn('[CONTACT-CACHE] Error preloading contacts from database:', err.message);
        }
    }

    clear() {
        this.cache.clear();
        this.lidMap.clear();
    }
}

module.exports = new ContactCache();
module.exports.ContactCache = ContactCache;
