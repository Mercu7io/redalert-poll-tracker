const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    getAggregateVotesInPollMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

const config = require('../config/env');
const contactCache = require('./contactCache');
const alertService = require('./alertService');
const pollRepository = require('../repositories/pollRepository');
const voteRepository = require('../repositories/voteRepository');
const contactRepository = require('../repositories/contactRepository');
const pollService = require('./pollService');
const { bufferReviver } = pollService;

class WhatsAppService {
    constructor() {
        this.sock = null;
        this.isConnected = false;
        this.qrCodeDataUrl = null;
        this.syncCheckInterval = null;
        this.pollCache = new Map();
        this.io = null;
        this.isReconnecting = false;
        this.logger = pino({ level: 'silent' });
    }

    setSocketIO(io) {
        this.io = io;
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            qrCodeDataUrl: this.qrCodeDataUrl
        };
    }

    getSocket() {
        return this.sock;
    }

    emitStatus() {
        if (this.io) {
            this.io.emit('wa_status', this.getStatus());
        }
    }

    cleanupCurrentSocket() {
        if (this.syncCheckInterval) {
            clearInterval(this.syncCheckInterval);
            this.syncCheckInterval = null;
        }
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
            } catch (e) {
                // Ignore listener cleanup errors
            }
            this.sock = null;
        }
    }

    async boot() {
        if (this.isReconnecting) return;
        this.cleanupCurrentSocket();

        console.log("🚀 Starting Baileys Engine (No Chromium Required)...");

        if (!fs.existsSync(config.authDir)) {
            fs.mkdirSync(config.authDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: this.logger,
            generateHighQualityLinkPreview: true,
            getMessage: async () => ({ conversation: '' })
        });

        this.sock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('Action Required: New QR Code generated.');
                this.qrCodeDataUrl = await qrcode.toDataURL(qr);
                this.isConnected = false;
                this.emitStatus();
            }

            if (connection === 'close') {
                if (this.syncCheckInterval) clearInterval(this.syncCheckInterval);

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log(`Alert: WhatsApp disconnected (status ${statusCode}). Reconnect allowed: ${shouldReconnect}`);

                this.isConnected = false;
                this.qrCodeDataUrl = null;
                this.emitStatus();

                this.cleanupCurrentSocket();

                if (shouldReconnect) {
                    setTimeout(() => this.boot(), 5000);
                } else {
                    console.log('Session Logged Out. Wiping auth folder...');
                    try {
                        fs.rmSync(config.authDir, { recursive: true, force: true });
                    } catch (e) {
                        console.error('Error removing auth folder:', e.message);
                    }
                    setTimeout(() => this.boot(), 2000);
                }
            } else if (connection === 'open') {
                console.log('✅ Success: Baileys Engine is Connected and Ready!');
                this.isConnected = true;
                this.qrCodeDataUrl = null;
                this.emitStatus();

                if (this.syncCheckInterval) clearInterval(this.syncCheckInterval);
                let consecutiveMatches = 0;
                let lastCount = 0;

                this.syncCheckInterval = setInterval(async () => {
                    if (!this.isConnected || !this.sock) {
                        return clearInterval(this.syncCheckInterval);
                    }
                    try {
                        const groups = await this.sock.groupFetchAllParticipating();
                        const groupCount = Object.keys(groups).length;

                        if (groupCount > 0) {
                            if (groupCount === lastCount) consecutiveMatches++;
                            else {
                                consecutiveMatches = 0;
                                lastCount = groupCount;
                            }

                            if (consecutiveMatches >= 2) {
                                console.log(`Sync update: Chat list stabilized with ${groupCount} groups.`);
                                this.emitStatus();
                                clearInterval(this.syncCheckInterval);
                            }
                        }
                    } catch (e) {}
                }, 3000);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const msg of messages) {
                await this.processMessage(msg);
            }
        });

        sock.ev.on('contacts.upsert', (contacts) => contactCache.hydrate(contacts));
        sock.ev.on('contacts.update', (contacts) => contactCache.hydrate(contacts));

        sock.ev.on('messaging-history.set', async ({ messages, contacts }) => {
            if (contacts && contacts.length > 0) {
                console.log(`Background Sync: Hydrating ${contacts.length} contacts into cache...`);
                contactCache.hydrate(contacts);
            }
            if (messages && messages.length > 0) {
                console.log(`Background Sync: Processing ${messages.length} historical messages for polls...`);
                for (const msg of messages) {
                    await this.processMessage(msg);
                }
            }
        });
    }

    async processMessage(msg) {
        if (!msg || !msg.message) return;

        const groupId = msg.key?.remoteJid;
        const msgId = msg.key?.id;
        if (!groupId || !msgId) return;

        const isFromMe = !!msg.key?.fromMe;
        const rawParticipant = msg.key?.participant || (!groupId.endsWith('@g.us') ? groupId : null);

        if (rawParticipant && !isFromMe && msg.pushName) {
            const senderId = rawParticipant.split(':')[0];
            contactCache.set(senderId, msg.pushName);
            contactCache.set(senderId.split('@')[0], msg.pushName);
        }

        // Unwrap disappearing / viewOnce wrappers
        let msgContent = msg.message;
        if (msgContent.ephemeralMessage?.message) msgContent = msgContent.ephemeralMessage.message;
        if (msgContent.viewOnceMessage?.message) msgContent = msgContent.viewOnceMessage.message;
        if (msgContent.viewOnceMessageV2?.message) msgContent = msgContent.viewOnceMessageV2.message;

        // 1. Detect Poll Creation
        const pollCreation = msgContent.pollCreationMessage || 
                             msgContent.pollCreationMessageV2 || 
                             msgContent.pollCreationMessageV3;
        if (pollCreation) {
            const title = pollCreation.name;
            const rawMessage = JSON.stringify(msg);
            this.pollCache.set(msgId, msg);

            try {
                const res = await pollRepository.create({ id: msgId, groupId, title, rawMessage });
                if (res.changes > 0) {
                    console.log(`Sync: New Poll Detected - "${title}" in Group ${groupId}`);
                    if (this.io) {
                        this.io.emit('poll_update', { groupId, pollId: msgId });
                    }
                }
            } catch (err) {
                console.error('[POLL] Error inserting new poll:', err.message);
            }
        }

        // 2. Detect Poll Vote Update
        const pollUpdate = msgContent.pollUpdateMessage;
        if (pollUpdate && pollUpdate.pollCreationMessageKey?.id) {
            const pollId = pollUpdate.pollCreationMessageKey.id;
            const rawVoter = msg.key.participant || msg.key.remoteJid;
            const voterId = rawVoter.split(':')[0];

            try {
                let originalMsg = this.pollCache.get(pollId);
                if (!originalMsg) {
                    const rawDb = await pollRepository.getRawMessage(pollId);
                    if (rawDb) {
                        try {
                            originalMsg = JSON.parse(rawDb, bufferReviver);
                            this.pollCache.set(pollId, originalMsg);
                        } catch (e) {
                            console.error('[DEBUG] Failed to parse poll JSON from DB:', e.message);
                        }
                    }
                }

                if (!originalMsg) {
                    return;
                }

                // Resolve all possible alternate JIDs for the voter (LID vs Phone JID)
                const extraVoterCandidates = [];
                if (msg.key?.participantAlt) extraVoterCandidates.push(msg.key.participantAlt);
                if (msg.key?.remoteJidAlt) extraVoterCandidates.push(msg.key.remoteJidAlt);

                const cachedMapped = contactCache.lidMap.get(voterId);
                if (cachedMapped) extraVoterCandidates.push(cachedMapped);

                const dbVoterContact = await contactRepository.getByIdOrLid(voterId);
                if (dbVoterContact) {
                    if (dbVoterContact.id) extraVoterCandidates.push(dbVoterContact.id);
                    if (dbVoterContact.lid) extraVoterCandidates.push(dbVoterContact.lid);
                    if (dbVoterContact.phone_number) {
                        extraVoterCandidates.push(`${dbVoterContact.phone_number}@s.whatsapp.net`);
                        extraVoterCandidates.push(dbVoterContact.phone_number);
                    }
                }

                // If not found in contacts, scan group metadata to discover any unmapped LID/Phone pairs
                if (!dbVoterContact && this.sock && groupId.endsWith('@g.us')) {
                    try {
                        const group = await this.sock.groupMetadata(groupId);
                        for (const p of group.participants || []) {
                            const pId = p.id ? p.id.split(':')[0] : null;
                            const pLid = p.lid ? p.lid.split(':')[0] : null;
                            if (pId && pLid) {
                                contactCache.lidMap.set(pLid, pId);
                                if (pLid === voterId || pId === voterId) {
                                    extraVoterCandidates.push(pId);
                                    extraVoterCandidates.push(pLid);
                                    if (p.phoneNumber) {
                                        extraVoterCandidates.push(`${p.phoneNumber}@s.whatsapp.net`);
                                    }
                                }
                            }
                        }
                    } catch (e) {}
                }

                // Resolve all possible alternate JIDs for the creator
                const extraCreatorCandidates = [];
                if (originalMsg.participant) extraCreatorCandidates.push(originalMsg.participant);
                if (pollUpdate.pollCreationMessageKey?.participant) {
                    extraCreatorCandidates.push(pollUpdate.pollCreationMessageKey.participant);
                }
                if (pollUpdate.pollCreationMessageKey?.participantAlt) {
                    extraCreatorCandidates.push(pollUpdate.pollCreationMessageKey.participantAlt);
                }

                // Decrypt the vote using our robust decryptVote method
                const decryptedVote = pollService.decryptVote({
                    pollUpdate,
                    originalMsg,
                    voterJid: rawVoter,
                    botUser: this.sock?.user,
                    extraVoterCandidates,
                    extraCreatorCandidates
                });

                const pollOptions = pollService.extractPollOptions(JSON.stringify(originalMsg));
                const userOptions = decryptedVote 
                    ? pollService.extractSelectedOptions(pollOptions, decryptedVote) 
                    : [];

                if (!decryptedVote) {
                    console.warn(`[DECRYPT FAILED] Could not decrypt vote from ${voterId} on poll ${pollId}`);
                    return;
                }
                console.log(`[DECRYPT SUCCESS] Vote options for ${voterId}:`, userOptions);

                // Exclude bot from voting records
                const botCleanId = this.sock?.user?.id ? this.sock.user.id.split(':')[0] : null;
                const botCleanLid = this.sock?.user?.lid ? this.sock.user.lid.split(':')[0] : null;
                const isBot = voterId === botCleanId || voterId === botCleanLid || (botCleanId && voterId.split('@')[0] === botCleanId.split('@')[0]);

                if (isBot) {
                    return;
                }

                const voterName = msg.pushName || (dbVoterContact?.name || dbVoterContact?.notify) || contactCache.get(voterId) || null;
                if (msg.pushName) {
                    contactCache.set(voterId, msg.pushName);
                }

                // Save vote under voterId
                await voteRepository.saveVote({
                    pollId,
                    voterId,
                    voterName,
                    options: userOptions
                });

                // Also save under mapped phone JID if different, so stats table matches directly
                const primaryPhoneId = dbVoterContact?.id || (cachedMapped && cachedMapped.includes('@') ? cachedMapped : null);
                if (primaryPhoneId && primaryPhoneId !== voterId && !primaryPhoneId.includes(botCleanId?.split('@')[0] || '___')) {
                    await voteRepository.saveVote({
                        pollId,
                        voterId: primaryPhoneId,
                        voterName,
                        options: userOptions
                    });
                }

                console.log(`Vote Recorded: ${voterName ? `${voterName} (${voterId})` : voterId} voted [${userOptions.join(', ')}] on poll ${pollId}`);

                if (this.io) {
                    this.io.emit('vote_update', { pollId, voterId, voterName, options: userOptions });
                }

                await alertService.handleVoteAlert({
                    socket: this.sock,
                    pollId,
                    voterId,
                    options: userOptions
                });

            } catch (e) {
                console.error('[DEBUG] Decryption / Vote processing error:', e.message);
            }
        }
    }

    async syncChatHistory(groupId, pollId = null) {
        if (!this.sock || !this.isConnected) {
            throw new Error('WhatsApp client is offline');
        }

        let oldestMsgKey = null;
        let oldestMsgTimestamp = null;

        if (pollId) {
            const rawDb = await pollRepository.getRawMessage(pollId);
            if (rawDb) {
                try {
                    const parsed = JSON.parse(rawDb, bufferReviver);
                    oldestMsgKey = parsed.key;
                    oldestMsgTimestamp = parsed.messageTimestamp ? Number(parsed.messageTimestamp) * 1000 : null;
                } catch (e) {}
            }
        }

        if (!oldestMsgKey) {
            oldestMsgKey = { remoteJid: groupId, fromMe: false, id: pollId || 'sync_anchor' };
            oldestMsgTimestamp = Date.now();
        }

        try {
            if (typeof this.sock.fetchMessageHistory === 'function') {
                await this.sock.fetchMessageHistory(50, oldestMsgKey, oldestMsgTimestamp);
                console.log(`[SYNC] fetchMessageHistory requested for group ${groupId}`);
                return { requested: true, message: 'History sync requested from companion device' };
            }
            return { requested: false, message: 'fetchMessageHistory not available on socket' };
        } catch (err) {
            console.warn('[SYNC] fetchMessageHistory error:', err.message);
            return { requested: false, error: err.message };
        }
    }

    async disconnect() {
        if (this.syncCheckInterval) {
            clearInterval(this.syncCheckInterval);
            this.syncCheckInterval = null;
        }
        if (this.sock && this.isConnected) {
            await this.sock.logout();
        }
        this.cleanupCurrentSocket();
        this.isConnected = false;
        this.qrCodeDataUrl = null;
        this.emitStatus();
    }
}

module.exports = new WhatsAppService();
module.exports.WhatsAppService = WhatsAppService;

