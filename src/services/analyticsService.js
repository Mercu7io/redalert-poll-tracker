const alertRepository = require('../repositories/alertRepository');
const contactRepository = require('../repositories/contactRepository');
const { CATEGORY_MAP } = require('./tzevaAdomService');

class AnalyticsService {
    constructor({ alertRepo = alertRepository, contactRepo = contactRepository } = {}) {
        this.alertRepo = alertRepo;
        this.contactRepo = contactRepo;
    }

    async getAnalytics({ period = '24h', groupId = null } = {}) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        let sinceSeconds = 0;

        switch (period) {
            case '24h':
                sinceSeconds = nowSeconds - (24 * 3600);
                break;
            case '7d':
                sinceSeconds = nowSeconds - (7 * 86400);
                break;
            case '30d':
                sinceSeconds = nowSeconds - (30 * 86400);
                break;
            case 'all':
            default:
                sinceSeconds = 0;
                break;
        }

        // 1. Retrieve all alerts in the specified period
        const alerts = await this.alertRepo.getRecentAlerts(sinceSeconds);

        // 2. Count by category
        const categoryCounts = {};
        for (const a of alerts) {
            const catId = a.categoryId || 1;
            categoryCounts[catId] = (categoryCounts[catId] || 0) + 1;
        }

        const categoryBreakdown = Object.entries(categoryCounts).map(([catId, count]) => {
            const idNum = Number(catId);
            const meta = CATEGORY_MAP[idNum] || { key: 'general', en: 'Other Alert', fr: 'Autre alerte', icon: '⚠️' };
            const percentage = alerts.length > 0 ? Math.round((count / alerts.length) * 100) : 0;
            return {
                categoryId: idNum,
                key: meta.key,
                titleEn: meta.en,
                titleFr: meta.fr,
                icon: meta.icon,
                count,
                percentage
            };
        }).sort((a, b) => b.count - a.count);

        // 3. Count by city (Top 10)
        const cityCounts = {};
        for (const a of alerts) {
            for (const cityName of a.cities || []) {
                const clean = String(cityName).trim();
                if (clean) {
                    cityCounts[clean] = (cityCounts[clean] || 0) + 1;
                }
            }
        }

        const topCities = Object.entries(cityCounts)
            .map(([cityName, count]) => ({ cityName, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // 4. Correlate with tracked members (optionally filtered by group)
        const contacts = await this.contactRepo.getContactsByGroup({ groupId: groupId || null });
        const contactsWithCity = contacts.filter(c => c.city_name || c.city_name_en);

        const memberImpact = [];
        for (const contact of contactsWithCity) {
            const hebrew = (contact.city_name || '').trim().toLowerCase();
            const english = (contact.city_name_en || '').trim().toLowerCase();

            // Count alerts matching this contact's city
            let alertCount = 0;
            for (const a of alerts) {
                const matches = (a.cities || []).some(c => {
                    const cleanC = String(c).trim().toLowerCase();
                    return (hebrew && (cleanC === hebrew || cleanC.startsWith(hebrew) || hebrew.startsWith(cleanC))) ||
                           (english && (cleanC === english || cleanC.includes(english)));
                });
                if (matches) alertCount++;
            }

            if (alertCount > 0) {
                memberImpact.push({
                    id: contact.id,
                    name: contact.name || contact.notify || contact.phone_number || contact.id,
                    number: contact.phone_number ? `+${contact.phone_number.split('@')[0].replace(/\D/g, '')}` : null,
                    cityName: contact.city_name,
                    cityNameEn: contact.city_name_en,
                    countdown: contact.city_countdown,
                    alertsReceived: alertCount
                });
            }
        }

        memberImpact.sort((a, b) => b.alertsReceived - a.alertsReceived);

        return {
            period,
            totalAlerts: alerts.length,
            sinceDate: sinceSeconds > 0 ? new Date(sinceSeconds * 1000).toISOString() : null,
            topCities,
            categoryBreakdown,
            affectedMembersCount: memberImpact.length,
            memberImpact: memberImpact.slice(0, 15)
        };
    }
}

module.exports = new AnalyticsService();
module.exports.AnalyticsService = AnalyticsService;

