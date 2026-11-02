const fs = require('fs');
const path = require('path');

class CityService {
    constructor(citiesFilePath = path.join(__dirname, '..', 'data', 'cities.json')) {
        this.citiesFilePath = citiesFilePath;
        this.cities = [];
        this.citiesById = new Map();
        this.citiesByHebrew = new Map();
        this.citiesByEnglish = new Map();
        this.loadCities();
    }

    loadCities() {
        try {
            if (!fs.existsSync(this.citiesFilePath)) {
                console.warn(`[CITY] Warning: cities file not found at ${this.citiesFilePath}`);
                return;
            }

            const raw = fs.readFileSync(this.citiesFilePath, 'utf-8');
            const data = JSON.parse(raw);

            const entries = Array.isArray(data) ? data : Object.values(data);
            this.cities = [];
            this.citiesById.clear();
            this.citiesByHebrew.clear();
            this.citiesByEnglish.clear();

            for (const item of entries) {
                if (!item || item.id === 0 || item.value === 'all') {
                    continue; // Skip aggregate entry
                }

                const city = {
                    id: Number(item.id),
                    name: String(item.name || '').trim(),
                    nameEn: String(item.name_en || '').trim(),
                    zone: String(item.zone || '').trim(),
                    zoneEn: String(item.zone_en || '').trim(),
                    countdown: Number(item.countdown) || 0,
                    lat: Number(item.lat) || 0,
                    lng: Number(item.lng) || 0
                };

                if (city.name) {
                    this.cities.push(city);
                    this.citiesById.set(city.id, city);
                    this.citiesByHebrew.set(city.name.toLowerCase(), city);
                    if (city.nameEn) {
                        this.citiesByEnglish.set(city.nameEn.toLowerCase(), city);
                    }
                }
            }
        } catch (err) {
            console.error(`[CITY] Failed to load cities from ${this.citiesFilePath}:`, err.message);
        }
    }

    search(query, limit = 20) {
        if (!query || typeof query !== 'string') {
            // Return top popular/major cities when search query is empty
            const defaults = ['Tel Aviv - Yafo', 'Jerusalem', 'Haifa', 'Ashkelon', 'Ashdod', 'Be\'er Sheva', 'Sderot', 'Netanya', 'Rishon LeTsiyon', 'Petah Tikva'];
            const res = [];
            for (const def of defaults) {
                const c = this.citiesByEnglish.get(def.toLowerCase());
                if (c) res.push(c);
            }
            return res.concat(this.cities.slice(0, Math.max(0, limit - res.length)));
        }

        const q = query.trim().toLowerCase();
        if (!q) return this.cities.slice(0, limit);

        const startsWithMatches = [];
        const containsMatches = [];

        for (const city of this.cities) {
            const en = city.nameEn.toLowerCase();
            const he = city.name.toLowerCase();

            if (en.startsWith(q) || he.startsWith(q)) {
                startsWithMatches.push(city);
            } else if (en.includes(q) || he.includes(q)) {
                containsMatches.push(city);
            }

            if (startsWithMatches.length >= limit) break;
        }

        return [...startsWithMatches, ...containsMatches].slice(0, limit);
    }

    getCityByName(name) {
        if (!name || typeof name !== 'string') return null;
        const clean = name.trim().toLowerCase();
        const exact = this.citiesByHebrew.get(clean) || this.citiesByEnglish.get(clean);
        if (exact) return exact;

        const normClean = clean.replace(/['`]/g, '').replace(/[\-–—]/g, ' ').replace(/\s+/g, ' ').trim();

        // Fallback: match by prefix (e.g. "Ashkelon" matches "Ashkelon - South") or normalized
        for (const city of this.cities) {
            const en = city.nameEn.toLowerCase();
            const he = city.name.toLowerCase();
            if (en.startsWith(clean) || he.startsWith(clean)) {
                return city;
            }

            const normEn = en.replace(/['`]/g, '').replace(/[\-–—]/g, ' ').replace(/\s+/g, ' ').trim();
            const normHe = he.replace(/['`]/g, '').replace(/[\-–—]/g, ' ').replace(/\s+/g, ' ').trim();

            if (normEn === normClean || normHe === normClean || normEn.startsWith(normClean) || normHe.startsWith(normClean) || normClean.startsWith(normEn) || normClean.startsWith(normHe)) {
                return city;
            }
        }
        return null;
    }

    getCityById(id) {
        return this.citiesById.get(Number(id)) || null;
    }

    getTotalCount() {
        return this.cities.length;
    }
}

module.exports = new CityService();
module.exports.CityService = CityService;
