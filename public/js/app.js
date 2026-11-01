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
        btnRemindAll: document.getElementById('btn-remind-all')
    };

    let socket = null;
    let statusTimer = null;
    let globalStats = [];
    let globalPollOptions = [];
    let expectingNewPoll = false;
    let currentSort = { column: 'name', dir: 'asc' };

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
        const pwd = pwdInput.value.trim();

        try {
            const res = await fetch('/api/login-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pwd })
            });

            if (res.ok) {
                errorEl.classList.add('hidden');
                api.setSession(pwd, parseInt(timeoutSelect.value, 10));
                els.login.classList.add('hidden');
                els.app.classList.remove('hidden');
                initSocket();
                checkStatus();
            } else {
                errorEl.classList.remove('hidden');
            }
        } catch (e) {
            errorEl.classList.remove('hidden');
        }
    }

    function logoutWeb() {
        api.clearSession();
        els.app.classList.add('hidden');
        els.login.classList.remove('hidden');
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

    async function loadGroups() {
        try {
            const res = await api.fetchAuth('/api/groups');
            if (!res.ok) throw new Error('Groups fetch failed');
            const groups = await res.json();
            els.groups.innerHTML = `<option value="">${i18n.t('config.selectGroupPlaceholder')}</option>`;
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                els.groups.appendChild(opt);
            });

            if (groups.length > 0) {
                els.groups.selectedIndex = 1;
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

            if (current && polls.some(p => p.id === current)) {
                els.polls.value = current;
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

    function forceSync() {
        const gid = els.groups.value;
        const pid = els.polls.value;
        if (gid && pid) {
            els.blank.classList.add('hidden');
            els.results.classList.remove('hidden');
            refreshStats(gid, pid);
        }
    }

    async function refreshStats(gid, pid, silent = false) {
        if (!silent) {
            els.members.innerHTML = '';
            els.loadingTable.classList.remove('hidden');
        }
        try {
            const res = await api.fetchAuth(`/api/poll-stats/${encodeURIComponent(gid)}/${encodeURIComponent(pid)}`);
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
        const fragment = document.createDocumentFragment();

        const filteredStats = globalStats.filter(m => {
            if (m.hasVoted) voted++;
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
            } else if (currentSort.column === 'status') {
                valA = a.hasVoted ? 1 : 0;
                valB = b.hasVoted ? 1 : 0;
            }
            if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
            if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
            return 0;
        });

        document.getElementById('sort-name').textContent = currentSort.column === 'name' ? (currentSort.dir === 'asc' ? '▲' : '▼') : '';
        document.getElementById('sort-status').textContent = currentSort.column === 'status' ? (currentSort.dir === 'asc' ? '▲' : '▼') : '';

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
                formattedTime = utcDate.toLocaleString();
            }

            const dotColorClass = m.hasVoted && displayOptions.length > 0 ? getOptionColor(displayOptions[0], globalPollOptions) : 'bg-slate-300 shadow-inner';

            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50 transition duration-100";
            const safeName = (m.name || '').replace(/'/g, "\\'");
            tr.innerHTML = `
                <td class="px-8 py-5 text-sm font-bold text-slate-700">
                    <div class="flex items-center space-x-1.5 group">
                        <span class="member-display-name">${m.name}</span>
                        <button onclick="window.PollApp.editContactName('${m.id}', '${safeName}', '${m.number || m.id}')" 
                                class="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-200/50 transition cursor-pointer" 
                                title="${i18n.t('contacts.editName')}">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                    </div>
                    <div class="text-[10px] font-normal text-slate-400 font-mono mt-0.5">${m.number || ''}</div>
                </td>
                <td class="px-8 py-5">
                    <div class="flex items-center mb-1">
                        <span class="w-2.5 h-2.5 rounded-full mr-2 shrink-0 ${dotColorClass}"></span>
                        <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${m.hasVoted ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}">
                            ${m.hasVoted ? i18n.t('results.responded') : i18n.t('results.pending')}
                        </span>
                    </div>
                    ${m.hasVoted ? `<div class="text-[9px] font-black text-slate-500 mt-2 ml-4">${displayOptions.join(', ')}</div>` : ''}
                    ${m.timestamp ? `<div class="text-[9px] font-semibold text-slate-400 mt-1 ml-4 flex items-center">
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${formattedTime}
                    </div>` : ''}
                </td>
                <td class="px-8 py-5 text-right">
                    ${!m.hasVoted ? `<button onclick="window.PollApp.sendReminder('${m.id}', this)" class="text-[9px] bg-blue-600 text-white font-black uppercase py-2 px-4 rounded-xl shadow-md hover:bg-blue-700 transition">${i18n.t('reminder.remind')}</button>` : '<div class="text-green-500 font-black px-4">✓</div>'}
                </td>
            `;
            fragment.appendChild(tr);
        });

        els.members.innerHTML = '';
        els.members.appendChild(fragment);
        els.stats.textContent = `${voted}/${globalStats.length}`;
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
        const defaultMsg = els.template.value.replace(/\[PollTitle\]/g, pollTitle);
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
            const targetIds = pendingMembers.map(m => m.id);
            const res = await api.fetchAuth('/api/remind-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetIds, customMessage: defaultMsg, delayMs: 1500 })
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

    // Setup event listeners
    window.addEventListener('DOMContentLoaded', async () => {
        await i18n.init();
        initSavedTemplate();

        document.getElementById('lang-select')?.addEventListener('change', async (e) => {
            await i18n.loadLanguage(e.target.value);
            els.pollTitle.value = generateDefaultPollTitle();
            renderTable();
        });

        els.groups.addEventListener('change', (e) => {
            const gid = e.target.value;
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

        els.polls.addEventListener('change', () => forceSync());
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
            initSocket();
            checkStatus();
        } else {
            els.login.classList.remove('hidden');
            els.app.classList.add('hidden');
        }
    });

    window.PollApp = {
        login,
        logoutWeb,
        disconnectWhatsApp,
        forceSync,
        createNewPoll,
        updatePollTime,
        sendReminder,
        editContactName,
        toggleSort,
        toggleBox: (id) => document.getElementById(id)?.classList.toggle('hidden')
    };
})();

