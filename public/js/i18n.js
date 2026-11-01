const i18n = {
    currentLang: localStorage.getItem('wa_poll_lang') || (navigator.language.startsWith('fr') ? 'fr' : 'en'),
    translations: {},

    async init() {
        await this.loadLanguage(this.currentLang);
    },

    async loadLanguage(lang) {
        try {
            const res = await fetch(`/locales/${lang}.json`);
            if (!res.ok) throw new Error('Locale not found');
            this.translations = await res.json();
            this.currentLang = lang;
            localStorage.setItem('wa_poll_lang', lang);
            this.applyTranslations();
        } catch (e) {
            console.error('Failed to load locale:', lang, e);
            if (lang !== 'en') await this.loadLanguage('en');
        }
    },

    t(keyPath, params = {}) {
        const keys = keyPath.split('.');
        let val = this.translations;
        for (const k of keys) {
            if (val && typeof val === 'object' && k in val) {
                val = val[k];
            } else {
                return keyPath;
            }
        }

        if (typeof val !== 'string') return keyPath;

        let formatted = val;
        for (const [pKey, pVal] of Object.entries(params)) {
            formatted = formatted.replace(new RegExp(`\\{${pKey}\\}`, 'g'), pVal);
        }
        return formatted;
    },

    async setLanguage(lang) {
        await this.loadLanguage(lang);
        const pollTitleEl = document.getElementById('new-poll-title');
        if (pollTitleEl && window.PollApp && typeof window.PollApp.generateDefaultPollTitle === 'function') {
            pollTitleEl.value = window.PollApp.generateDefaultPollTitle();
        }
        if (window.PollApp && typeof window.PollApp.renderTable === 'function') {
            window.PollApp.renderTable();
        }
    },

    applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.t(key);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.setAttribute('placeholder', this.t(key));
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.setAttribute('title', this.t(key));
        });

        document.documentElement.lang = this.currentLang;
        const selector = document.getElementById('lang-select');
        if (selector) selector.value = this.currentLang;
    }
};

window.i18n = i18n;

