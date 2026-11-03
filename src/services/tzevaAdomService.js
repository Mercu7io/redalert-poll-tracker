const WebSocket = require('ws');
const alertRepository = require('../repositories/alertRepository');
const cityService = require('./cityService');

const CATEGORY_MAP = {
    1: { key: 'missiles', en: 'Rockets & Missiles', fr: 'Tirs de roquettes et missiles', icon: '🚀' },
    2: { key: 'drone', en: 'Hostile Aircraft Intrusion', fr: 'Infiltration d\'aéronef hostile', icon: '🛸' },
    3: { key: 'infiltration', en: 'Terrorist Infiltration', fr: 'Infiltration de terroristes', icon: '⚠️' },
    4: { key: 'earthquake', en: 'Earthquake', fr: 'Séisme', icon: '🌋' },
    5: { key: 'drone', en: 'Hostile Aircraft Intrusion', fr: 'Infiltration d\'aéronef hostile', icon: '🛸' },
    6: { key: 'hazmat', en: 'Hazardous Materials', fr: 'Matières dangereuses', icon: '☣️' },
    7: { key: 'pre_alert', en: 'Early Warning', fr: 'Pré-alerte', icon: '⏳' },
    8: { key: 'unconventional', en: 'Radiological / Unconventional', fr: 'Alerte non-conventionnelle', icon: '☢️' },
    9: { key: 'tsunami', en: 'Tsunami', fr: 'Tsunami', icon: '🌊' },
    10: { key: 'earthquake', en: 'Earthquake', fr: 'Séisme', icon: '🌋' },
    13: { key: 'all_clear', en: 'All Clear', fr: 'Fin de l\'alerte', icon: '✅' },
    14: { key: 'pre_alert', en: 'Early Warning', fr: 'Pré-alerte', icon: '⏳' }
};

function resolveCategory(cat, title = '') {
    const rawTitle = String(title || '').toLowerCase();

    // 1. Text-based heuristic (most accurate when descriptive title is provided)
    if (rawTitle.includes('כלי טיס') || rawTitle.includes('drone') || rawTitle.includes('aircraft') || rawTitle.includes('aéronef')) {
        return { categoryId: 2, key: 'drone', en: 'Hostile Aircraft Intrusion', fr: 'Infiltration d\'aéronef hostile', icon: '🛸' };
    }
    if (rawTitle.includes('טילים') || rawTitle.includes('רקטות') || rawTitle.includes('missile') || rawTitle.includes('rocket') || rawTitle.includes('צבע אדום')) {
        return { categoryId: 1, key: 'missiles', en: 'Rockets & Missiles', fr: 'Tirs de roquettes et missiles', icon: '🚀' };
    }
    if (rawTitle.includes('מחבלים') || rawTitle.includes('terrorist') || rawTitle.includes('terroriste')) {
        return { categoryId: 3, key: 'infiltration', en: 'Terrorist Infiltration', fr: 'Infiltration de terroristes', icon: '⚠️' };
    }
    if (rawTitle.includes('רעידת אדמה') || rawTitle.includes('earthquake') || rawTitle.includes('séisme')) {
        return { categoryId: 4, key: 'earthquake', en: 'Earthquake', fr: 'Séisme', icon: '🌋' };
    }
    if (rawTitle.includes('צונאמי') || rawTitle.includes('tsunami')) {
        return { categoryId: 9, key: 'tsunami', en: 'Tsunami', fr: 'Tsunami', icon: '🌊' };
    }
    if (rawTitle.includes('חומרים מסוכנים') || rawTitle.includes('hazmat')) {
        return { categoryId: 6, key: 'hazmat', en: 'Hazardous Materials', fr: 'Matières dangereuses', icon: '☣️' };
    }

    // 2. Numeric mapping (handles Tzofar & Pikud HaOref threat codes)
    const num = Number(cat);
    if (num === 0 || num === 1) {
        return { categoryId: 1, key: 'missiles', en: 'Rockets & Missiles', fr: 'Tirs de roquettes et missiles', icon: '🚀' };
    }
    if (num === 5) {
        // In Tzofar alert feeds, category code 5 is Hostile Aircraft / Drone intrusion
        return { categoryId: 2, key: 'drone', en: 'Hostile Aircraft Intrusion', fr: 'Infiltration d\'aéronef hostile', icon: '🛸' };
    }
    if (num === 2) {
        // Cat 2 in Tzofar historical data is terrorist infiltration
        return { categoryId: 3, key: 'infiltration', en: 'Terrorist Infiltration', fr: 'Infiltration de terroristes', icon: '⚠️' };
    }

    const meta = CATEGORY_MAP[num];
    if (meta) {
        return { categoryId: num, ...meta };
    }

    return {
        categoryId: num || 1,
        key: 'general',
        en: title || 'Tzeva Adom Alert',
        fr: title || 'Alerte Tzeva Adom',
        icon: '⚠️'
    };
}

class TzevaAdomService {
    constructor(optionsOrCitySvc = {}, maybeAlertRepo = null) {
        if (optionsOrCitySvc && typeof optionsOrCitySvc.getCityByName === 'function') {
            this.citySvc = optionsOrCitySvc;
            this.alertRepo = maybeAlertRepo || alertRepository;
        } else {
            const { alertRepo = alertRepository, citySvc = cityService } = optionsOrCitySvc || {};
            this.alertRepo = alertRepo;
            this.citySvc = citySvc;
        }
        this.ws = null;
        this.io = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.pingInterval = null;
        this.pollInterval = null;
        this.isStopped = false;
        this.memoryAlerts = []; // Cached alerts from last 2 hours
        this.wsUrl = 'wss://ws.tzevaadom.co.il/socket?platform=WEB';
        this.httpApiUrl = 'https://api.tzevaadom.co.il/notifications';
    }

    setSocketIO(io) {
        this.io = io;
    }

    start() {
        this.isStopped = false;
        this.connect();
        this.startFallbackPolling();
    }

    stop() {
        this.isStopped = true;
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.ws) {
            try {
                this.ws.terminate();
            } catch {}
            this.ws = null;
        }
        this.isConnected = false;
    }

    connect() {
        if (this.isStopped) return;

        try {
            this.ws = new WebSocket(this.wsUrl, {
                headers: {
                    'Origin': 'https://www.tzevaadom.co.il',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                },
                handshakeTimeout: 8000
            });

            this.ws.on('open', () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                console.log('[TZEVA-ADOM] Connected to Tzofar real-time WebSocket');

                // Keep-alive heartbeat
                if (this.pingInterval) clearInterval(this.pingInterval);
                this.pingInterval = setInterval(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        try {
                            this.ws.ping();
                        } catch {}
                    }
                }, 30000);
            });

            this.ws.on('message', async (data) => {
                try {
                    const text = data.toString('utf-8');
                    if (!text || !text.trim() || text.trim() === 'ping' || text.trim() === 'pong') {
                        return;
                    }
                    const parsed = JSON.parse(text);
                    await this.processRawAlert(parsed);
                } catch (err) {
                    console.error('[TZEVA-ADOM] Error parsing alert message:', err.message);
                }
            });

            this.ws.on('close', () => {
                this.isConnected = false;
                if (!this.isStopped) {
                    this.scheduleReconnect();
                }
            });

            this.ws.on('error', (err) => {
                console.warn('[TZEVA-ADOM] WebSocket error:', err.message);
                // Socket close event will handle reconnect
            });
        } catch (err) {
            console.error('[TZEVA-ADOM] WebSocket connection exception:', err.message);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.isStopped) return;
        const delay = Math.min(30000, 2000 * Math.pow(1.5, this.reconnectAttempts));
        this.reconnectAttempts++;
        setTimeout(() => {
            if (!this.isStopped && !this.isConnected) {
                this.connect();
            }
        }, delay);
    }

    startFallbackPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(async () => {
            if (this.isStopped) return;
            // Redundancy optimization: if WebSocket is already connected, no need to poll HTTP
            if (this.isConnected) return;

            try {
                const res = await fetch(this.httpApiUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        for (const item of data) {
                            await this.processRawAlert(item);
                        }
                    }
                }
            } catch {}
        }, 30000);
    }

    async processRawAlert(raw) {
        if (!raw) return;

        // Support array payloads during multi-alert barrages
        if (Array.isArray(raw)) {
            for (const item of raw) {
                await this.processRawAlert(item);
            }
            return;
        }

        // Support both Tzofar payload formats: { id, cat, title, data: [cities], timestamp } or array
        const cities = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw.cities) ? raw.cities : []);
        if (cities.length === 0) return;

        let timestamp = Number(raw.timestamp) || Math.floor(Date.now() / 1000);
        if (timestamp > 1e11) {
            timestamp = Math.floor(timestamp / 1000); // Normalize ms to seconds
        }

        const alertId = String(raw.id || raw.notificationId || (raw.timestamp ? `alert_${timestamp}_${cities.slice(0, 3).join('_')}` : Date.now()));
        const rawCat = raw.cat !== undefined ? raw.cat : (raw.categoryId !== undefined ? raw.categoryId : 1);
        const categoryTitle = raw.title || raw.categoryTitle || 'Tzeva Adom Alert';
        const description = raw.desc || raw.description || null;

        // Prevent duplicate processing
        if (this.memoryAlerts.some(a => a.id === alertId)) {
            return;
        }

        // Resolve category using smart heuristics and correct Tzofar/Pikud mappings
        const categoryMeta = resolveCategory(rawCat, categoryTitle);
        const resolvedCategoryId = categoryMeta.categoryId;

        const alertItem = {
            id: alertId,
            categoryId: resolvedCategoryId,
            categoryTitle,
            categoryKey: categoryMeta.key,
            categoryLabelEn: categoryMeta.en,
            categoryLabelFr: categoryMeta.fr,
            categoryIcon: categoryMeta.icon,
            categoryEn: categoryMeta.en,
            categoryFr: categoryMeta.fr,
            icon: categoryMeta.icon,
            cities,
            description,
            timestamp
        };

        // Cache in memory (keep last 2 hours)
        const cutoff = Math.floor(Date.now() / 1000) - (2 * 3600);
        this.memoryAlerts = [alertItem, ...this.memoryAlerts.filter(a => a.timestamp >= cutoff)].slice(0, 500);

        // Persist to SQLite
        try {
            await this.alertRepo.saveAlert({
                id: alertId,
                categoryId: resolvedCategoryId,
                categoryTitle: categoryMeta.en || categoryTitle,
                cities,
                description,
                timestamp
            });
        } catch (e) {
            console.error('[TZEVA-ADOM] DB Save Error:', e.message);
        }

        console.log(`[TZEVA-ADOM] ALERT RECEIVED: ${categoryMeta.icon} ${categoryMeta.en} (${categoryTitle}) in ${cities.length} cities (${cities.slice(0, 3).join(', ')}${cities.length > 3 ? '...' : ''})`);

        // Emit through Socket.IO to connected web clients
        if (this.io) {
            this.io.emit('alert_event', alertItem);
        }
    }

    checkCityAlertStatus(cityIdentifier, windowMinutes = 10, referenceTimestamp = null, customAlertsList = null) {
        if (!cityIdentifier) {
            return { hasAlert: false, alert: null };
        }

        const normalizeStr = (s) => {
            if (!s) return '';
            return String(s)
                .replace(/['`]/g, '')
                .replace(/[\-–—]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        };

        const windowSeconds = Number(windowMinutes) * 60;
        const nowSeconds = Math.floor(Date.now() / 1000);

        let minTimestamp, maxTimestamp;
        if (referenceTimestamp) {
            const ref = Number(referenceTimestamp);
            minTimestamp = ref - windowSeconds;
            // If the poll happened recently (within 2h) or is current, check up to now; otherwise check up to ref + window
            maxTimestamp = (nowSeconds - ref <= 7200 && nowSeconds >= ref)
                ? Math.max(ref + windowSeconds, nowSeconds)
                : (ref + windowSeconds);
        } else {
            minTimestamp = nowSeconds - windowSeconds;
            maxTimestamp = nowSeconds + 60;
        }

        let targetHebrew = '';
        let targetEnglish = '';
        let countdown = 0;

        if (typeof cityIdentifier === 'object' && cityIdentifier) {
            targetHebrew = String(cityIdentifier.name || '').trim().toLowerCase();
            targetEnglish = String(cityIdentifier.nameEn || '').trim().toLowerCase();
            countdown = cityIdentifier.countdown || 0;
        } else {
            const rawStr = String(cityIdentifier).trim();
            const resolvedCity = this.citySvc.getCityByName(rawStr);
            if (resolvedCity) {
                targetHebrew = resolvedCity.name.toLowerCase();
                targetEnglish = resolvedCity.nameEn.toLowerCase();
                countdown = resolvedCity.countdown || 0;
            } else {
                targetHebrew = rawStr.toLowerCase();
                targetEnglish = rawStr.toLowerCase();
            }
        }

        const normHebrew = normalizeStr(targetHebrew);
        const normEnglish = normalizeStr(targetEnglish);

        // Merge memory alerts with any provided SQLite alerts (deduplicating by id)
        const combinedAlerts = [];
        const seenIds = new Set();
        const alertSources = [
            ...(Array.isArray(customAlertsList) ? customAlertsList : []),
            ...this.memoryAlerts
        ];

        for (const a of alertSources) {
            if (a && a.id && !seenIds.has(a.id)) {
                seenIds.add(a.id);
                combinedAlerts.push(a);
            }
        }

        const candidateAlerts = combinedAlerts.filter(a => a.timestamp >= minTimestamp && a.timestamp <= maxTimestamp);

        for (const alert of candidateAlerts) {
            const match = (alert.cities || []).some(cityName => {
                const c = String(cityName).trim().toLowerCase();
                const normC = normalizeStr(cityName);

                if (targetHebrew && (c === targetHebrew || c.startsWith(targetHebrew) || targetHebrew.startsWith(c))) {
                    return true;
                }
                if (normHebrew && (normC === normHebrew || normC.startsWith(normHebrew) || normHebrew.startsWith(normC))) {
                    return true;
                }
                if (targetEnglish && (c === targetEnglish || c.includes(targetEnglish))) {
                    return true;
                }
                if (normEnglish && (normC === normEnglish || normC.includes(normEnglish))) {
                    return true;
                }
                return false;
            });

            if (match) {
                const minutesAgo = Math.max(0, Math.floor((nowSeconds - alert.timestamp) / 60));
                const categoryMeta = resolveCategory(alert.categoryId, alert.categoryTitle);
                return {
                    hasAlert: true,
                    icon: categoryMeta.icon,
                    categoryKey: categoryMeta.key,
                    categoryEn: categoryMeta.en,
                    categoryFr: categoryMeta.fr,
                    categoryLabelEn: categoryMeta.en,
                    categoryLabelFr: categoryMeta.fr,
                    minutesAgo,
                    countdown,
                    alert: {
                        id: alert.id,
                        categoryId: categoryMeta.categoryId,
                        categoryKey: categoryMeta.key,
                        categoryTitle: alert.categoryTitle,
                        categoryLabelEn: categoryMeta.en,
                        categoryLabelFr: categoryMeta.fr,
                        categoryIcon: categoryMeta.icon,
                        categoryEn: categoryMeta.en,
                        categoryFr: categoryMeta.fr,
                        timestamp: alert.timestamp,
                        minutesAgo,
                        countdown
                    }
                };
            }
        }

        return { hasAlert: false, alert: null };
    }

    getRecentAlerts(windowMinutes = 60) {
        const sinceSeconds = Math.floor(Date.now() / 1000) - (Number(windowMinutes) * 60);
        return this.memoryAlerts.filter(a => a.timestamp >= sinceSeconds);
    }
}

module.exports = new TzevaAdomService();
module.exports.TzevaAdomService = TzevaAdomService;
module.exports.CATEGORY_MAP = CATEGORY_MAP;
module.exports.resolveCategory = resolveCategory;

