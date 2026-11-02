(() => {
    const els = {
        login: document.getElementById('login-section'),
        app: document.getElementById('app-container'),
        debug: document.getElementById('boot-status'),
        auth: document.getElementById('auth-section'),
        results: document.getElementById('results-section'),
        qr: document.getElementById('qr-code'),
        groups: document.getElementById('group-select'),
        polls: document.getElementById('poll-select'),
        filter: document.getElementById('filter-select'),
        members: document.getElementById('members-list'),
        stats: document.getElementById('stats-summary'),
        conn: document.getElementById('connection-indicator'),
        template: document.getElementById('default-message-template'),
        pollTitle: document.getElementById('new-poll-title'),
        pollOptions: document.getElementById('new-poll-options'),
        pollSelectable: document.getElementById('poll-selectable-count'),
        blank: document.getElementById('initial-blank'),
        blankText: document.getElementById('initial-blank-text'),
        blankSpinner: document.getElementById('initial-blank-spinner'),
        loadingTable: document.getElementById('loading-table'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        btnRemindAll: document.getElementById('btn-remind-all'),
        alertWindowSelect: document.getElementById('alert-window-select'),
        liveAlertBanner: document.getElementById('live-alert-banner'),
        liveAlertTitle: document.getElementById('live-alert-title'),
        liveAlertDesc: document.getElementById('live-alert-desc'),
        cityModal: document.getElementById('city-modal'),
        cityModalTitle: document.getElementById('city-modal-title'),
        citySearchInput: document.getElementById('city-search-input'),
        cityResultsList: document.getElementById('city-results-list')
    };

    let socket = null;
    let statusTimer = null;
    let globalStats = [];
    let globalPollOptions = [];
    let expectingNewPoll = false;
    let currentSort = { column: 'name', dir: 'asc' };
    let activeCityContactId = null;
    let citySearchDebounce = null;

    const optionColors = ['bg-green-500', 'bg-blue-500', 'bg-yellow-400', 'bg-purple-500', 'bg-orange-500', 'bg-teal-500'];

    function getOptionColor(optName, allOptions) {
        if (!allOptions || allOptions.length === 0) return optionColors[5];
        const strOpt = String(optName).trim();
        let idx = allOptions.findIndex(o => String(o).trim() === strOpt);
        if (idx === -1) idx = allOptions.findIndex(o => String(o).includes(strOpt) || strOpt.includes(String(o)));
        if (idx === -1) idx = 5;
        return optionColors[idx % optionColors.length];
    }

    function initSavedTemplate() {
        const saved = localStorage.getItem('wa_poll_msg');
        if (saved) {
            els.template.value = saved;
        } else {
            els.template.value = i18n.t('reminder.defaultMessage');
        }
        els.template.addEventListener('input', (e) => localStorage.setItem('wa_poll_msg', e.target.value));
    }

    function getFormattedDateTime(date = new Date()) {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        const hr = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return {
            dateStr: `${d}/${m}/${y}`,
            timeStr: `${hr}:${min}`,
            timestamp: `[${d}/${m}/${y} - ${hr}:${min}]`
        };
    }

    function generateDefaultPollTitle() {
        const { dateStr, timeStr } = getFormattedDateTime();
        return i18n.t('broadcast.defaultTitle', { date: dateStr, time: timeStr });
    }

    function updatePollTime() {
        const { dateStr, timeStr, timestamp } = getFormattedDateTime();

        const currentTitle = els.pollTitle.value.trim();
        if (/^\[.*?\]/.test(currentTitle)) {
            els.pollTitle.value = currentTitle.replace(/^\[.*?\]/, timestamp);
        } else if (currentTitle) {
            els.pollTitle.value = `${timestamp} - ${currentTitle}`;
        } else {
            els.pollTitle.value = i18n.t('broadcast.defaultTitle', { date: dateStr, time: timeStr });
        }

        // Visual flash feedback
        els.pollTitle.classList.add('ring-2', 'ring-white/50');
        setTimeout(() => els.pollTitle.classList.remove('ring-2', 'ring-white/50'), 400);
    }

    function updateUIState(data) {
        els.login.classList.add('hidden');
        els.app.classList.remove('hidden');

        if (data.isConnected) {
            els.auth.classList.add('hidden');

            if (els.groups.options.length <= 1) {
                els.blankText.textContent = i18n.t('results.loading');
                els.blankSpinner.classList.remove('hidden');
                els.blank.classList.remove('hidden');
                els.results.classList.add('hidden');
                loadGroups();
            } else if (els.groups.value && els.polls.value) {
                els.blank.classList.add('hidden');
                els.results.classList.remove('hidden');
            } else {
                els.blankText.textContent = i18n.t('results.selectToStart');
                els.blankSpinner.classList.add('hidden');
                els.blank.classList.remove('hidden');
                els.results.classList.add('hidden');
            }
        } else {
            els.results.classList.add('hidden');
            els.blank.classList.add('hidden');
            els.auth.classList.remove('hidden');
            if (data.qrCodeDataUrl) {
                els.qr.src = data.qrCodeDataUrl;
                els.qr.classList.remove('opacity-10');
                els.debug.textContent = i18n.t('auth.ready');
            } else {
                els.qr.classList.add('opacity-10');
                els.debug.textContent = i18n.t('auth.booting');
            }
        }
    }

    function initSocket() {
        if (socket) return;
        socket = io(location.origin, {
            auth: { token: api.getPassword() }
        });

        socket.on('connect', () => {
            els.conn.textContent = i18n.t('header.liveConnected');
            els.conn.className = "text-[10px] font-black uppercase px-4 py-2 rounded-full bg-green-100 text-green-700";
            checkStatus();
        });

        socket.on('disconnect', () => {
            els.conn.textContent = i18n.t('header.liveOffline');
            els.conn.className = "text-[10px] font-black uppercase px-4 py-2 rounded-full bg-red-100 text-red-700";
        });

        socket.on('wa_status', (data) => {
            clearTimeout(statusTimer);
            updateUIState(data);
            if (!data.isConnected) statusTimer = setTimeout(checkStatus, 3000);
        });

        socket.on('poll_update', async (data) => {
            if (els.groups.value === data.groupId) {
                await refreshPolls(data.groupId, true);
                if (expectingNewPoll) {
                    els.polls.value = data.pollId;
                    expectingNewPoll = false;
                    forceSync();
                }
            }
        });

        socket.on('vote_update', (data) => {
            console.log('[REALTIME] Received vote_update event:', data);
            const currentPid = els.polls.value;
            if (!currentPid || currentPid === data.pollId || currentPid.includes(data.pollId) || data.pollId.includes(currentPid)) {
                if (els.groups.value) {
                    refreshStats(els.groups.value, currentPid || data.pollId, true);
                }
            }
        });

        socket.on('alert_event', (data) => {
            handleIncomingAlert(data);
        });
    }

    function handleIncomingAlert(alertData) {
        if (!alertData) return;
        console.log('[REALTIME] Incoming Tzeva Adom alert:', alertData);
        if (els.liveAlertBanner) {
            const rawTs = Number(alertData.timestamp) || Date.now();
            const tsMs = rawTs < 1e11 ? rawTs * 1000 : rawTs;
            const timeStr = new Date(tsMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const catLabel = i18n.currentLanguage === 'fr' 
                ? (alertData.categoryFr || alertData.categoryLabelFr || alertData.categoryEn || alertData.categoryLabelEn || alertData.categoryTitle || 'Alerte') 
                : (alertData.categoryEn || alertData.categoryLabelEn || alertData.categoryTitle || 'Alert');
            const alertIcon = alertData.icon || alertData.categoryIcon || '🚨';
            if (els.liveAlertTitle) {
                els.liveAlertTitle.textContent = `${alertIcon} ${catLabel} [${timeStr}]`;
            }
            if (els.liveAlertDesc) {
                const cityList = (alertData.citiesEn && alertData.citiesEn.length > 0) ? alertData.citiesEn : alertData.cities;
                const displayCities = (cityList || []).slice(0, 8).join(', ');
                const extra = (cityList && cityList.length > 8) ? ` +${cityList.length - 8}` : '';
                els.liveAlertDesc.textContent = `${displayCities}${extra}`;
            }
            els.liveAlertBanner.classList.remove('hidden');
        }

        // Auto-refresh poll stats if a group and poll are currently selected
        const gid = els.groups.value;
        const pid = els.polls.value;
        if (gid && pid) {
            refreshStats(gid, pid, true);
        }
    }

    async function checkStatus() {
        clearTimeout(statusTimer);
        if (!api.isAuthenticated()) return logoutWeb();

        try {
            const res = await api.fetchAuth('/api/status?t=' + Date.now(), { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                updateUIState(data);
                if (!data.isConnected) statusTimer = setTimeout(checkStatus, 3000);
            }
        } catch {
            statusTimer = setTimeout(checkStatus, 5000);
        }
    }

    async function login() {
        const pwdInput = document.getElementById('password-input');
        const timeoutSelect = document.getElementById('timeout-select');
        const errorEl = document.getElementById('login-error');
        const pwd = pwdInput ? pwdInput.value.trim() : '';

        if (!pwd) {
            if (errorEl) {
                errorEl.classList.remove('hidden');
                errorEl.style.display = 'flex';
            }
            pwdInput?.focus();
            return;
        }

        try {
            const res = await fetch('/api/login-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pwd })
            });

            if (res.ok) {
                if (errorEl) {
                    errorEl.classList.add('hidden');
                    errorEl.style.display = 'none';
                }
                api.setSession(pwd, parseInt(timeoutSelect ? timeoutSelect.value : 60, 10));
                els.login.classList.add('hidden');
                els.app.classList.remove('hidden');
                document.getElementById('btn-logout')?.classList.remove('hidden');
                document.getElementById('connection-indicator')?.classList.remove('hidden');
                initSocket();
                checkStatus();
            } else {
                if (errorEl) {
                    errorEl.classList.remove('hidden');
                    errorEl.style.display = 'flex';
                }
                if (pwdInput) {
                    pwdInput.classList.add('ring-2', 'ring-rose-500', 'border-rose-500');
                    setTimeout(() => {
                        pwdInput.classList.remove('ring-2', 'ring-rose-500', 'border-rose-500');
                    }, 2000);
                }
            }
        } catch (e) {
            if (errorEl) {
                errorEl.classList.remove('hidden');
                errorEl.style.display = 'flex';
            }
        }
    }

    function logoutWeb() {
        api.clearSession();
        els.app.classList.add('hidden');
        els.login.classList.remove('hidden');
        document.getElementById('btn-logout')?.classList.add('hidden');
        document.getElementById('connection-indicator')?.classList.add('hidden');
        if (socket) {
            socket.disconnect();
            socket = null;
        }
    }

    async function disconnectWhatsApp() {
        if (!confirm(i18n.t('auth.confirmReset'))) return;
        await api.fetchAuth('/api/whatsapp/disconnect', { method: 'POST' });
        checkStatus();
    }

    function getFavoriteGroups() {
        try {
            return JSON.parse(localStorage.getItem('wa_favorite_groups') || '[]');
        } catch {
            return [];
        }
    }

    function saveFavoriteGroups(favs) {
        localStorage.setItem('wa_favorite_groups', JSON.stringify(favs));
    }

    function updateFavoriteStarState() {
        const currentGid = els.groups.value;
        const favorites = getFavoriteGroups();
        const isFav = currentGid && favorites.includes(currentGid);
        const starIcon = document.getElementById('fav-star-icon');
        const starText = document.getElementById('fav-star-text');
        if (starIcon) {
            if (isFav) {
                starIcon.classList.remove('text-slate-400');
                starIcon.classList.add('text-amber-500');
                starIcon.setAttribute('fill', 'currentColor');
            } else {
                starIcon.classList.add('text-slate-400');
                starIcon.classList.remove('text-amber-500');
                starIcon.setAttribute('fill', 'none');
            }
        }
        if (starText) {
            starText.textContent = isFav ? (i18n.t('config.favorited') || 'Favori ⭐') : (i18n.t('config.favorite') || 'Favori');
            starText.className = isFav ? 'text-[11px] font-bold text-amber-600' : 'text-[11px] font-bold text-slate-400';
        }
    }

    function toggleFavoriteGroup() {
        const currentGid = els.groups.value;
        if (!currentGid) return;
        let favorites = getFavoriteGroups();
        if (favorites.includes(currentGid)) {
            favorites = favorites.filter(id => id !== currentGid);
        } else {
            favorites.push(currentGid);
        }
        saveFavoriteGroups(favorites);
        loadGroups(currentGid);
    }

    async function loadGroups(preserveGid = null) {
        try {
            const res = await api.fetchAuth('/api/groups');
            if (!res.ok) throw new Error('Groups fetch failed');
            const groups = await res.json();
            const favorites = getFavoriteGroups();
            const favGroups = groups.filter(g => favorites.includes(g.id));
            const otherGroups = groups.filter(g => !favorites.includes(g.id));

            els.groups.innerHTML = `<option value="">${i18n.t('config.selectGroupPlaceholder')}</option>`;

            if (favGroups.length > 0) {
                const optGroupFav = document.createElement('optgroup');
                optGroupFav.label = i18n.t('config.favoritesGroup') || '⭐ Groupes Favoris';
                favGroups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = `⭐ ${g.name}`;
                    optGroupFav.appendChild(opt);
                });
                els.groups.appendChild(optGroupFav);
            }

            if (otherGroups.length > 0) {
                const optGroupAll = document.createElement('optgroup');
                optGroupAll.label = favGroups.length > 0 ? (i18n.t('config.allGroups') || 'Tous les groupes') : '';
                otherGroups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = g.name;
                    optGroupAll.appendChild(opt);
                });
                els.groups.appendChild(optGroupAll);
            }

            const targetGid = preserveGid || localStorage.getItem('wa_selected_group');
            if (targetGid && groups.some(g => g.id === targetGid)) {
                els.groups.value = targetGid;
            } else if (favGroups.length > 0) {
                els.groups.value = favGroups[0].id;
            } else if (groups.length > 0) {
                els.groups.value = groups[0].id;
            }

            updateFavoriteStarState();

            if (els.groups.value) {
                localStorage.setItem('wa_selected_group', els.groups.value);
                els.groups.dispatchEvent(new Event('change'));
            } else {
                els.blankText.textContent = i18n.t('results.selectToStart');
                els.blankSpinner.classList.add('hidden');
            }
        } catch {
            els.blankText.textContent = i18n.t('results.selectToStart');
            els.blankSpinner.classList.add('hidden');
        }
    }

    async function refreshPolls(gid, silent = false) {
        try {
            const res = await api.fetchAuth(`/api/polls/${encodeURIComponent(gid)}`);
            if (!res.ok) throw new Error('Failed to load polls');
            const polls = await res.json();
            const current = els.polls.value;
            els.polls.innerHTML = `<option value="">${i18n.t('config.selectPollPlaceholder')}</option>`;
            polls.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.title} (${new Date(p.timestamp).toLocaleString()})`;
                els.polls.appendChild(opt);
            });
            els.polls.disabled = false;

            const savedPid = localStorage.getItem('wa_selected_poll');
            if (current && polls.some(p => p.id === current)) {
                els.polls.value = current;
                forceSync();
            } else if (savedPid && polls.some(p => p.id === savedPid)) {
                els.polls.value = savedPid;
                forceSync();
            } else if (polls.length > 0) {
                els.polls.selectedIndex = 1;
                forceSync();
            } else {
                els.blankText.textContent = i18n.t('results.noPolls');
                els.blankSpinner.classList.add('hidden');
            }
        } catch {
            els.blankText.textContent = i18n.t('results.selectToStart');
            els.blankSpinner.classList.add('hidden');
        }
    }

    async function forceSync(manual = false) {
        const gid = els.groups.value;
        const pid = els.polls.value;
        if (gid && pid) {
            localStorage.setItem('wa_selected_group', gid);
            localStorage.setItem('wa_selected_poll', pid);
            els.blank.classList.add('hidden');
            els.results.classList.remove('hidden');

            if (manual) {
                try {
                    api.fetchAuth(`/api/sync-history/${encodeURIComponent(gid)}/${encodeURIComponent(pid)}`, {
                        method: 'POST'
                    }).catch(() => {});
                } catch (e) {}
            }

            refreshStats(gid, pid);
        }
    }

    function getAlertWindow() {
        return parseInt(localStorage.getItem('wa_alert_window') || '10', 10);
    }

    function onAlertWindowChange(val) {
        localStorage.setItem('wa_alert_window', val);
        const gid = els.groups.value;
        const pid = els.polls.value;
        if (gid && pid) {
            refreshStats(gid, pid, true);
        }
    }

    async function refreshStats(gid, pid, silent = false) {
        if (!silent) {
            els.members.innerHTML = '';
            els.loadingTable.classList.remove('hidden');
        }
        try {
            const alertWindow = getAlertWindow();
            const res = await api.fetchAuth(`/api/poll-stats/${encodeURIComponent(gid)}/${encodeURIComponent(pid)}?alertWindow=${alertWindow}`);
            if (!res.ok) throw new Error('Stats fetch error');
            const responseData = await res.json();

            globalStats = Array.isArray(responseData) ? responseData : responseData.stats;
            globalPollOptions = responseData.pollOptions || [];

            let filterHtml = `
                <option value="all">${i18n.t('results.allParticipants')}</option>
                <option value="pending">${i18n.t('results.pendingOnly')}</option>
                <option value="responded">${i18n.t('results.respondedOnly')}</option>
            `;
            globalPollOptions.forEach(opt => {
                filterHtml += `<option value="${opt}">${i18n.t('results.replyPrefix', { opt })}</option>`;
            });

            const currentFilter = els.filter.value;
            els.filter.innerHTML = filterHtml;

            if (els.filter.querySelector(`option[value="${currentFilter}"]`)) {
                els.filter.value = currentFilter;
            } else {
                els.filter.value = 'all';
            }

            renderTable();
        } catch (e) {
            console.error(e);
        } finally {
            els.loadingTable.classList.add('hidden');
        }
    }

    function getInitials(name = '') {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return (name.trim().substring(0, 2) || '?').toUpperCase();
    }

    const avatarColors = [
        'bg-blue-50 text-blue-700 border-blue-200/60',
        'bg-emerald-50 text-emerald-700 border-emerald-200/60',
        'bg-indigo-50 text-indigo-700 border-indigo-200/60',
        'bg-purple-50 text-purple-700 border-purple-200/60',
        'bg-amber-50 text-amber-700 border-amber-200/60',
        'bg-rose-50 text-rose-700 border-rose-200/60',
        'bg-teal-50 text-teal-700 border-teal-200/60'
    ];

    function getAvatarClass(name = '') {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return avatarColors[Math.abs(hash) % avatarColors.length];
    }

    function handleSearch() {
        renderTable();
    }

    function toggleSort(col) {
        if (currentSort.column === col) {
            currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = col;
            currentSort.dir = 'asc';
        }
        renderTable();
    }

    function renderTable() {
        let voted = 0;
        const filterVal = els.filter.value;
        const searchInput = document.getElementById('search-input');
        const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const fragment = document.createDocumentFragment();

        const filteredStats = globalStats.filter(m => {
            if (m.hasVoted) voted++;

            if (searchQuery) {
                const nameMatch = (m.name || '').toLowerCase().includes(searchQuery);
                const numberMatch = (m.number || '').toLowerCase().includes(searchQuery);
                const cityMatch = (m.cityNameEn || '').toLowerCase().includes(searchQuery) || (m.cityName || '').toLowerCase().includes(searchQuery);
                if (!nameMatch && !numberMatch && !cityMatch) return false;
            }

            if (filterVal === 'all') return true;
            if (filterVal === 'pending') return !m.hasVoted;
            if (filterVal === 'responded') return m.hasVoted;
            if (!m.hasVoted) return false;

            const displayOptions = (m.options || []).map(opt => {
                const optVal = typeof opt === 'object' ? (opt.name || opt.localName || '') : String(opt);
                if (/^\d+$/.test(optVal) && globalPollOptions.length > 0) {
                    const idx = parseInt(optVal, 10);
                    if (idx >= 0 && idx < globalPollOptions.length) {
                        return globalPollOptions[idx];
                    }
                }
                return optVal;
            });

            return displayOptions.some(opt => String(opt).trim() === String(filterVal).trim());
        });

        filteredStats.sort((a, b) => {
            let valA, valB;
            if (currentSort.column === 'name') {
                valA = (a.name || '').toLowerCase();
                valB = (b.name || '').toLowerCase();
            } else if (currentSort.column === 'location') {
                valA = (a.cityNameEn || a.cityName || '').toLowerCase();
                valB = (b.cityNameEn || b.cityName || '').toLowerCase();
            } else if (currentSort.column === 'status') {
                valA = a.hasVoted ? 1 : 0;
                valB = b.hasVoted ? 1 : 0;
            }
            if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
            return 0;
        });

        const sortNameEl = document.getElementById('sort-name');
        if (sortNameEl) sortNameEl.textContent = currentSort.column === 'name' ? (currentSort.dir === 'asc' ? '▲' : '▼') : '';
        const sortLocEl = document.getElementById('sort-location');
        if (sortLocEl) sortLocEl.textContent = currentSort.column === 'location' ? (currentSort.dir === 'asc' ? '▲' : '▼') : '';
        const sortStatusEl = document.getElementById('sort-status');
        if (sortStatusEl) sortStatusEl.textContent = currentSort.column === 'status' ? (currentSort.dir === 'asc' ? '▲' : '▼') : '';

        filteredStats.forEach(m => {
            let displayOptions = [];
            if (m.options && Array.isArray(m.options)) {
                displayOptions = m.options.map(opt => {
                    const optVal = typeof opt === 'object' ? (opt.name || opt.localName || '') : String(opt);
                    if (/^\d+$/.test(optVal) && globalPollOptions.length > 0) {
                        const idx = parseInt(optVal, 10);
                        if (idx >= 0 && idx < globalPollOptions.length) {
                            return globalPollOptions[idx];
                        }
                    }
                    return optVal;
                });
            }

            let formattedTime = '';
            if (m.timestamp) {
                const utcDate = new Date(m.timestamp.replace(' ', 'T') + 'Z');
                formattedTime = utcDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            }

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50/80 transition-colors duration-150 group";
            const safeName = (m.name || '').replace(/'/g, "\\'");
            const initials = getInitials(m.name);
            const avatarColor = getAvatarClass(m.name);

            // Option badges markup
            const optionsBadges = displayOptions.map(opt => {
                const isEmergency = /help|aide|sos|secours/i.test(opt);
                const badgeColor = isEmergency 
                    ? 'bg-rose-50 text-rose-700 border-rose-200/80 font-bold' 
                    : 'bg-blue-50 text-blue-700 border-blue-200/70 font-semibold';
                return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] border ${badgeColor} mr-1 mb-0.5 shadow-2xs">${opt}</span>`;
            }).join('');

            tr.innerHTML = `
                <td class="px-6 py-4 text-xs">
                    <div class="flex items-center space-x-3">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border shrink-0 shadow-2xs ${avatarColor}">
                            ${initials}
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center space-x-1.5">
                                <span class="member-display-name font-bold text-slate-900 truncate">${m.name}</span>
                                <button onclick="window.PollApp.editContactName('${m.id}', '${safeName}', '${m.number || m.id}')" 
                                        class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-slate-100 transition-opacity duration-150 cursor-pointer" 
                                        title="${i18n.t('contacts.editName')}">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>
                            </div>
                            <div class="text-[11px] font-mono text-slate-500 mt-0.5">${m.number || ''}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 text-xs">
                    ${(m.cityNameEn || m.cityName) ? `
                        <div class="space-y-1.5">
                            <div class="flex items-center space-x-1.5">
                                <span class="font-bold text-slate-800 text-xs">${m.cityNameEn || m.cityName}</span>
                                ${m.cityCountdown ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200/80">⏱️ ${m.cityCountdown}s</span>` : ''}
                                <button onclick="window.PollApp.openCityModal('${m.id}', '${safeName}', '${(m.cityNameEn || m.cityName).replace(/'/g, "\\'")}')" 
                                        class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 p-0.5 rounded hover:bg-slate-100 transition-opacity cursor-pointer" 
                                        title="${i18n.t('alerts.chooseCityModalTitle', { name: safeName })}">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>
                            </div>
                            <div>
                                ${(m.alertStatus && m.alertStatus.hasAlert) ? `
                                    <span class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-300 shadow-xs animate-pulse">
                                        <span class="w-2 h-2 rounded-full bg-rose-600"></span>
                                        <span>${m.alertStatus.icon || m.alertStatus.alert?.categoryIcon || '🚨'} ${i18n.currentLanguage === 'fr' ? (m.alertStatus.categoryFr || m.alertStatus.alert?.categoryLabelFr || m.alertStatus.categoryEn || m.alertStatus.alert?.categoryLabelEn || 'Alerte') : (m.alertStatus.categoryEn || m.alertStatus.alert?.categoryLabelEn || 'Alert')}</span>
                                        <span class="text-[9px] text-rose-500 font-mono">(${m.alertStatus.minutesAgo ?? m.alertStatus.alert?.minutesAgo ?? 0}m)</span>
                                    </span>
                                ` : `
                                    <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70 shadow-2xs">
                                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        <span>${i18n.t('results.safe')}</span>
                                        <span class="text-[9px] text-emerald-600/70 font-mono">(${getAlertWindow()}m)</span>
                                    </span>
                                `}
                            </div>
                        </div>
                    ` : `
                        <button onclick="window.PollApp.openCityModal('${m.id}', '${safeName}')" class="inline-flex items-center space-x-1 text-[11px] font-semibold text-slate-400 hover:text-blue-600 hover:bg-blue-50/80 px-2.5 py-1 rounded-lg border border-dashed border-slate-200 transition cursor-pointer">
                            <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            <span>${i18n.t('results.setLocation')}</span>
                        </button>
                    `}
                </td>
                <td class="px-6 py-4 text-xs">
                    <div class="flex items-center space-x-2">
                        <span class="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border ${m.hasVoted ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' : 'bg-amber-50 text-amber-700 border-amber-200/80'}">
                            <span class="w-1.5 h-1.5 rounded-full ${m.hasVoted ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}"></span>
                            <span>${m.hasVoted ? i18n.t('results.responded') : i18n.t('results.pending')}</span>
                        </span>
                        ${formattedTime ? `<span class="text-[10px] text-slate-400 font-mono inline-flex items-center"><svg class="w-3 h-3 mr-1 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>${formattedTime}</span>` : ''}
                    </div>
                    ${displayOptions.length > 0 ? `<div class="mt-2 flex flex-wrap items-center">${optionsBadges}</div>` : ''}
                </td>
                <td class="px-6 py-4 text-right">
                    ${!m.hasVoted ? `
                        <button onclick="window.PollApp.sendReminder('${m.id}', this)" class="inline-flex items-center space-x-1 text-xs bg-slate-900 hover:bg-black text-white font-bold py-1.5 px-3 rounded-xl shadow-xs transition active:scale-95 cursor-pointer">
                            <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                            <span>${i18n.t('reminder.remind')}</span>
                        </button>
                    ` : `
                        <span class="inline-flex items-center space-x-1 text-emerald-600 bg-emerald-50 border border-emerald-200/60 font-bold px-2.5 py-1 rounded-xl text-xs">
                            <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                            <span>OK</span>
                        </span>
                    `}
                </td>
            `;
            fragment.appendChild(tr);
        });

        els.members.innerHTML = '';
        els.members.appendChild(fragment);
        els.stats.textContent = `${voted}/${globalStats.length}`;

        // Live Metric Cards update
        const totalCount = globalStats.length;
        const votedCount = voted;
        const pendingCount = Math.max(0, totalCount - votedCount);
        const percent = totalCount > 0 ? Math.round((votedCount / totalCount) * 100) : 0;

        const totalEl = document.getElementById('metric-total');
        if (totalEl) totalEl.textContent = totalCount;
        const votedEl = document.getElementById('metric-voted');
        if (votedEl) votedEl.textContent = votedCount;
        const pendingEl = document.getElementById('metric-pending');
        if (pendingEl) pendingEl.textContent = pendingCount;
        const percentEl = document.getElementById('metric-percent');
        if (percentEl) percentEl.textContent = `${percent}%`;
        const progressBar = document.getElementById('metric-progress-bar');
        if (progressBar) progressBar.style.width = `${percent}%`;
    }

    async function createNewPoll() {
        const gid = els.groups.value;
        const title = els.pollTitle.value.trim();
        const opts = els.pollOptions.value.split('\n').filter(o => o.trim());
        const selectableCount = parseInt(els.pollSelectable.value, 10) || 1;

        if (!gid) return alert(i18n.t('config.selectGroupFirst'));
        if (!title) return alert('Title is required');
        if (opts.length < 2) return alert('At least 2 options are required');

        const btn = document.getElementById('btn-create-poll');
        btn.disabled = true;
        btn.textContent = i18n.t('broadcast.launching');
        expectingNewPoll = true;

        try {
            const res = await api.fetchAuth('/api/polls/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId: gid, title, options: opts, selectableCount })
            });

            if (res.ok) {
                els.pollTitle.value = generateDefaultPollTitle();
            } else {
                alert('Failed to launch poll');
            }
        } catch (e) {
            alert('Error creating poll');
        } finally {
            btn.disabled = false;
            btn.textContent = i18n.t('broadcast.launchButton');
        }
    }

    async function sendReminder(targetId, btn) {
        const raw = els.polls.options[els.polls.selectedIndex]?.text || '';
        const pollTitle = raw.includes(' (') ? raw.substring(0, raw.lastIndexOf(' (')) : raw;
        const member = globalStats.find(m => m.id === targetId || (m.lid && m.lid === targetId));
        const memberName = (member && member.name && !member.name.startsWith('+') && member.name !== 'Hidden Contact') 
            ? member.name 
            : (member?.number && !member.number.startsWith('Hidden') ? member.number : '');

        let defaultMsg = els.template.value.replace(/\[PollTitle\]/g, pollTitle);
        if (memberName) {
            defaultMsg = defaultMsg.replace(/\[Name\]/g, memberName);
        } else {
            defaultMsg = defaultMsg.replace(/\s*\[Name\]\s*/g, ' ').replace(/\s+([,!?.:;])/g, '$1');
        }
        defaultMsg = defaultMsg.replace(/\s{2,}/g, ' ').trim();

        const msg = prompt('Edit reminder message:', defaultMsg);
        if (!msg) return;

        btn.disabled = true;
        btn.textContent = '...';

        try {
            const res = await api.fetchAuth('/api/remind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetId, customMessage: msg })
            });

            if (res.ok) {
                btn.textContent = i18n.t('reminder.sent');
                btn.className = "text-[9px] bg-slate-900 text-white font-black py-2 px-4 rounded-xl";
            } else {
                btn.disabled = false;
                btn.textContent = i18n.t('reminder.retry');
            }
        } catch {
            btn.disabled = false;
            btn.textContent = i18n.t('reminder.retry');
        }
    }

    async function sendBulkReminders() {
        const pendingMembers = globalStats.filter(m => !m.hasVoted);
        if (pendingMembers.length === 0) {
            return alert('No pending participants to remind!');
        }

        const raw = els.polls.options[els.polls.selectedIndex]?.text || '';
        const pollTitle = raw.includes(' (') ? raw.substring(0, raw.lastIndexOf(' (')) : raw;
        const defaultMsg = els.template.value.replace(/\[PollTitle\]/g, pollTitle);

        const confirmMsg = `Send reminders to ${pendingMembers.length} pending members?\n\nTemplate:\n"${defaultMsg}"`;
        if (!confirm(confirmMsg)) return;

        els.btnRemindAll.disabled = true;
        els.btnRemindAll.textContent = i18n.t('reminder.reminding');

        try {
            const targets = pendingMembers.map(m => ({
                id: m.id,
                name: (m.name && !m.name.startsWith('+') && m.name !== 'Hidden Contact') ? m.name : ''
            }));
            const res = await api.fetchAuth('/api/remind-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    targetIds: targets.map(t => t.id), 
                    targets,
                    customMessage: defaultMsg, 
                    delayMs: 1500 
                })
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Successfully sent ${data.sentCount} / ${data.total} reminders!`);
            } else {
                alert('Error sending bulk reminders');
            }
        } catch (e) {
            alert('Failed to send bulk reminders');
        } finally {
            els.btnRemindAll.disabled = false;
            els.btnRemindAll.textContent = i18n.t('reminder.remindAll');
        }
    }

    async function exportCsv() {
        const gid = els.groups.value;
        const pid = els.polls.value;
        if (!gid || !pid) return;

        try {
            const res = await api.fetchAuth(`/api/export/${encodeURIComponent(gid)}/${encodeURIComponent(pid)}`);
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `poll_stats_${Date.now()}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Failed to export CSV');
        }
    }

    async function editContactName(memberId, currentName, memberNumber) {
        const promptMsg = i18n.t('contacts.promptEditName', { number: memberNumber || memberId });
        const newName = prompt(promptMsg, currentName || '');
        if (!newName || newName.trim() === '' || newName.trim() === currentName) return;

        const trimmedName = newName.trim();
        try {
            const res = await api.fetchAuth('/api/contacts/update-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: memberId, customName: trimmedName })
            });

            if (res.ok) {
                // Update in local array so changes reflect instantly
                globalStats.forEach(m => {
                    const cleanMemberId = m.id.split('@')[0];
                    const cleanTargetId = memberId.split('@')[0];
                    if (m.id === memberId || cleanMemberId === cleanTargetId) {
                        m.name = trimmedName;
                    }
                });
                renderTable();
            } else {
                alert(i18n.t('contacts.updateFailed'));
            }
        } catch (e) {
            alert(i18n.t('contacts.updateFailed'));
        }
    }

    let currentCityResultsMap = new Map();

    function openCityModal(contactId, contactName, currentCity = '') {
        activeCityContactId = contactId;
        const member = globalStats.find(m => m.id === contactId || (m.lid && m.lid === contactId));
        const displayName = contactName || member?.name || member?.number || contactId;
        if (els.cityModalTitle) {
            els.cityModalTitle.textContent = i18n.t('alerts.chooseCityModalTitle', { name: displayName });
        }
        const existingCity = currentCity || member?.cityNameEn || member?.cityName || '';
        if (els.citySearchInput) {
            els.citySearchInput.value = existingCity;
        }
        els.cityModal?.classList.remove('hidden');
        performCitySearch(existingCity);
        setTimeout(() => els.citySearchInput?.focus(), 50);
    }

    function closeCityModal() {
        activeCityContactId = null;
        els.cityModal?.classList.add('hidden');
    }

    async function performCitySearch(query) {
        if (!els.cityResultsList) return;
        els.cityResultsList.innerHTML = `
            <div class="p-6 text-center text-xs text-slate-400 font-medium">
                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <span>${i18n.t('header.syncing') || 'Searching...'}</span>
            </div>
        `;

        try {
            const res = await api.fetchAuth('/api/cities/search?q=' + encodeURIComponent(query || ''));
            if (!res.ok) {
                els.cityResultsList.innerHTML = `<div class="p-4 text-center text-xs text-rose-500 font-medium">Error loading cities (${res.status})</div>`;
                return;
            }
            const cities = await res.json();
            renderCityResults(cities);
        } catch (e) {
            console.error('Failed to search cities', e);
            els.cityResultsList.innerHTML = `<div class="p-4 text-center text-xs text-rose-500 font-medium">Failed to search cities</div>`;
        }
    }

    function handleCitySearch(val) {
        clearTimeout(citySearchDebounce);
        citySearchDebounce = setTimeout(() => {
            performCitySearch(val);
        }, 150);
    }

    function renderCityResults(cities) {
        if (!els.cityResultsList) return;
        currentCityResultsMap.clear();
        if (!cities || cities.length === 0) {
            els.cityResultsList.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 font-medium">No cities found</div>`;
            return;
        }
        cities.forEach(c => currentCityResultsMap.set(Number(c.id), c));
        els.cityResultsList.innerHTML = cities.map(c => `
            <div onclick="window.PollApp.selectContactCityById(${c.id})" 
                 class="p-2.5 hover:bg-blue-50/80 rounded-xl cursor-pointer flex items-center justify-between group transition">
                <div>
                    <div class="text-xs font-bold text-slate-800 group-hover:text-blue-600">${c.nameEn || c.name}</div>
                    <div class="text-[11px] text-slate-400 font-medium">${c.name} ${c.zoneEn ? `• ${c.zoneEn}` : ''}</div>
                </div>
                ${c.countdown ? `
                    <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-700 text-slate-600 border border-slate-200/80">
                        ⏱️ ${c.countdown}s
                    </span>
                ` : ''}
            </div>
        `).join('');
    }

    function selectContactCityById(cityId) {
        const cityObj = currentCityResultsMap.get(Number(cityId));
        if (cityObj) selectContactCity(cityObj);
    }

    async function selectContactCity(cityObj) {
        if (!activeCityContactId || !cityObj) return;
        const targetId = activeCityContactId;
        try {
            const res = await api.fetchAuth('/api/contacts/update-city', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: targetId,
                    cityId: cityObj.id,
                    cityName: cityObj.name,
                    cityNameEn: cityObj.nameEn,
                    cityCountdown: cityObj.countdown
                })
            });

            if (res.ok) {
                globalStats.forEach(m => {
                    const cleanMemberId = m.id.split('@')[0];
                    const cleanTargetId = targetId.split('@')[0];
                    const cleanLid = m.lid ? m.lid.split('@')[0] : '';
                    if (m.id === targetId || cleanMemberId === cleanTargetId || (m.lid && m.lid === targetId) || (cleanLid && cleanLid === cleanTargetId)) {
                        m.cityId = cityObj.id;
                        m.cityName = cityObj.name;
                        m.cityNameEn = cityObj.nameEn;
                        m.cityCountdown = cityObj.countdown;
                    }
                });
                closeCityModal();
                renderTable();
                const gid = els.groups.value;
                const pid = els.polls.value;
                if (gid && pid) refreshStats(gid, pid, true);
            } else {
                alert(i18n.t('alerts.cityUpdateFailed'));
            }
        } catch (e) {
            alert(i18n.t('alerts.cityUpdateFailed'));
        }
    }

    async function clearContactCity() {
        if (!activeCityContactId) return;
        const targetId = activeCityContactId;
        try {
            const res = await api.fetchAuth('/api/contacts/update-city', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: targetId,
                    cityId: null,
                    cityName: null,
                    cityNameEn: null,
                    cityCountdown: null
                })
            });

            if (res.ok) {
                globalStats.forEach(m => {
                    const cleanMemberId = m.id.split('@')[0];
                    const cleanTargetId = targetId.split('@')[0];
                    const cleanLid = m.lid ? m.lid.split('@')[0] : '';
                    if (m.id === targetId || cleanMemberId === cleanTargetId || (m.lid && m.lid === targetId) || (cleanLid && cleanLid === cleanTargetId)) {
                        m.cityId = null;
                        m.cityName = null;
                        m.cityNameEn = null;
                        m.cityCountdown = null;
                        m.alertStatus = null;
                    }
                });
                closeCityModal();
                renderTable();
                const gid = els.groups.value;
                const pid = els.polls.value;
                if (gid && pid) refreshStats(gid, pid, true);
            } else {
                alert(i18n.t('alerts.cityUpdateFailed'));
            }
        } catch (e) {
            alert(i18n.t('alerts.cityUpdateFailed'));
        }
    }

    // Setup event listeners
    window.addEventListener('DOMContentLoaded', async () => {
        await i18n.init();
        initSavedTemplate();

        if (els.alertWindowSelect) {
            els.alertWindowSelect.value = String(getAlertWindow());
        }

        const pwdInput = document.getElementById('password-input');
        pwdInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                login();
            }
        });
        pwdInput?.addEventListener('input', () => {
            const errorEl = document.getElementById('login-error');
            if (errorEl) {
                errorEl.classList.add('hidden');
                errorEl.style.display = 'none';
            }
        });

        document.getElementById('lang-select')?.addEventListener('change', async (e) => {
            await i18n.setLanguage(e.target.value);
        });

        els.groups.addEventListener('change', (e) => {
            const gid = e.target.value;
            localStorage.setItem('wa_selected_group', gid);
            updateFavoriteStarState();
            els.results.classList.add('hidden');
            els.blank.classList.remove('hidden');
            if (!gid) {
                els.polls.disabled = true;
                return;
            }

            els.blankText.textContent = i18n.t('results.loading');
            els.blankSpinner.classList.remove('hidden');
            els.pollTitle.value = generateDefaultPollTitle();
            els.pollOptions.value = i18n.t('broadcast.defaultOptions');
            refreshPolls(gid, false);
        });

        els.polls.addEventListener('change', () => {
            localStorage.setItem('wa_selected_poll', els.polls.value);
            forceSync();
        });
        els.filter.addEventListener('change', renderTable);
        els.btnExportCsv?.addEventListener('click', exportCsv);
        els.btnRemindAll?.addEventListener('click', sendBulkReminders);

        window.addEventListener('auth:expired', logoutWeb);

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                if (api.isAuthenticated()) {
                    checkStatus();
                    if (els.groups.value && els.polls.value) forceSync();
                }
            }
        });

        if (api.isAuthenticated()) {
            els.login.classList.add('hidden');
            els.app.classList.remove('hidden');
            document.getElementById('btn-logout')?.classList.remove('hidden');
            document.getElementById('connection-indicator')?.classList.remove('hidden');
            initSocket();
            checkStatus();
        } else {
            els.login.classList.remove('hidden');
            els.app.classList.add('hidden');
            document.getElementById('btn-logout')?.classList.add('hidden');
            document.getElementById('connection-indicator')?.classList.add('hidden');
        }
    });

    window.PollApp = {
        login,
        logoutWeb,
        disconnectWhatsApp,
        forceSync: () => forceSync(true),
        createNewPoll,
        updatePollTime,
        sendReminder,
        editContactName,
        openCityModal,
        closeCityModal,
        handleCitySearch,
        selectContactCity,
        selectContactCityById,
        clearContactCity,
        onAlertWindowChange,
        toggleSort,
        handleSearch,
        toggleFavoriteGroup,
        renderTable,
        generateDefaultPollTitle,
        toggleBox: (id) => document.getElementById(id)?.classList.toggle('hidden')
    };
})();

