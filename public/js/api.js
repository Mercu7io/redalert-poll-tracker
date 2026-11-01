const api = {
    getPassword() {
        return localStorage.getItem('wa_poll_pwd') || '';
    },

    getExpiry() {
        return parseInt(localStorage.getItem('wa_poll_expiry') || '0', 10);
    },

    isAuthenticated() {
        return !!this.getPassword() && Date.now() < this.getExpiry();
    },

    setSession(password, durationMinutes) {
        const expiry = Date.now() + (durationMinutes * 60 * 1000);
        localStorage.setItem('wa_poll_pwd', password);
        localStorage.setItem('wa_poll_expiry', expiry);
    },

    clearSession() {
        localStorage.removeItem('wa_poll_pwd');
        localStorage.removeItem('wa_poll_expiry');
    },

    async fetchAuth(url, options = {}) {
        const headers = {
            ...(options.headers || {}),
            'x-app-password': this.getPassword()
        };

        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            this.clearSession();
            window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        return res;
    }
};

window.api = api;

