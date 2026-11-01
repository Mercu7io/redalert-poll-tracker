const crypto = require('crypto');
const { decryptPollVote } = require('@whiskeysockets/baileys');
const pollRepository = require('../repositories/pollRepository');
const voteRepository = require('../repositories/voteRepository');
const contactRepository = require('../repositories/contactRepository');
const contactCache = require('./contactCache');

const bufferReviver = (key, value) => {
    if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
        return Buffer.from(value.data);
    }
    return value;
};

class PollService {
    extractPollOptions(rawMessageStr) {
        if (!rawMessageStr) return [];
        try {
            const originalMsg = JSON.parse(rawMessageStr, bufferReviver);
            const content = originalMsg?.message;
            const pollCreation = content?.pollCreationMessage || 
                                 content?.pollCreationMessageV2 || 
                                 content?.pollCreationMessageV3 ||
                                 content?.ephemeralMessage?.message?.pollCreationMessage ||
                                 content?.ephemeralMessage?.message?.pollCreationMessageV2 ||
                                 content?.ephemeralMessage?.message?.pollCreationMessageV3;

            if (pollCreation?.options) {
                return pollCreation.options.map(opt => opt.optionName);
            }
        } catch (e) {
            console.error('[POLL] Error parsing raw message options:', e.message);
        }
        return [];
    }

    decryptVote({ pollUpdate, originalMsg, voterJid, botUser, extraVoterCandidates = [], extraCreatorCandidates = [] }) {
        if (!pollUpdate?.vote || !originalMsg) return null;

        const rawSecret = originalMsg.message?.messageContextInfo?.messageSecret ||
                          originalMsg.messageContextInfo?.messageSecret ||
                          originalMsg.message?.pollCreationMessage?.messageContextInfo?.messageSecret ||
                          originalMsg.message?.pollCreationMessageV2?.messageContextInfo?.messageSecret ||
                          originalMsg.message?.pollCreationMessageV3?.messageContextInfo?.messageSecret;

        if (!rawSecret) {
            console.error('[POLL DECRYPT] Missing messageSecret in originalMsg');
            return null;
        }

        let pollEncKey = null;
        if (Buffer.isBuffer(rawSecret)) {
            pollEncKey = rawSecret;
        } else if (rawSecret.type === 'Buffer' && Array.isArray(rawSecret.data)) {
            pollEncKey = Buffer.from(rawSecret.data);
        } else if (typeof rawSecret === 'string') {
            pollEncKey = Buffer.from(rawSecret, 'base64');
        } else if (rawSecret instanceof Uint8Array || Array.isArray(rawSecret)) {
            pollEncKey = Buffer.from(rawSecret);
        }

        if (!pollEncKey || pollEncKey.length !== 32) {
            console.error('[POLL DECRYPT] Invalid pollEncKey length:', pollEncKey?.length);
            return null;
        }

        const pollMsgId = pollUpdate.pollCreationMessageKey?.id || originalMsg.key?.id;
        if (!pollMsgId) return null;

        // Collect creator candidates
        const creatorCandidates = [...extraCreatorCandidates];

        if (pollUpdate.pollCreationMessageKey?.participant) {
            creatorCandidates.push(pollUpdate.pollCreationMessageKey.participant.split(':')[0]);
            creatorCandidates.push(pollUpdate.pollCreationMessageKey.participant);
        }
        if (pollUpdate.pollCreationMessageKey?.participantAlt) {
            creatorCandidates.push(pollUpdate.pollCreationMessageKey.participantAlt.split(':')[0]);
            creatorCandidates.push(pollUpdate.pollCreationMessageKey.participantAlt);
        }

        if (originalMsg.participant) {
            creatorCandidates.push(originalMsg.participant.split(':')[0]);
            creatorCandidates.push(originalMsg.participant);
        }

        if (originalMsg.key?.participant) {
            creatorCandidates.push(originalMsg.key.participant.split(':')[0]);
            creatorCandidates.push(originalMsg.key.participant);
        }

        if (botUser) {
            if (botUser.id) {
                const cleanBotId = botUser.id.split(':')[0];
                creatorCandidates.push(cleanBotId.includes('@') ? cleanBotId : `${cleanBotId}@s.whatsapp.net`);
                creatorCandidates.push(botUser.id);
            }
            if (botUser.lid) {
                creatorCandidates.push(botUser.lid.split(':')[0]);
                creatorCandidates.push(botUser.lid);
            }
        }

        if (originalMsg.key?.remoteJid && !originalMsg.key.remoteJid.endsWith('@g.us')) {
            creatorCandidates.push(originalMsg.key.remoteJid.split(':')[0]);
        }

        // Collect voter candidates
        const voterCandidates = [...extraVoterCandidates];
        if (voterJid) {
            voterCandidates.push(voterJid.split(':')[0]);
            voterCandidates.push(voterJid);
        }

        const encPayload = Buffer.isBuffer(pollUpdate.vote.encPayload)
            ? pollUpdate.vote.encPayload
            : Buffer.from(pollUpdate.vote.encPayload);
        const encIv = Buffer.isBuffer(pollUpdate.vote.encIv)
            ? pollUpdate.vote.encIv
            : Buffer.from(pollUpdate.vote.encIv);

        const cleanCreators = [...new Set(creatorCandidates.filter(Boolean))];
        const cleanVoters = [...new Set(voterCandidates.filter(Boolean))];

        for (const creator of cleanCreators) {
            for (const voter of cleanVoters) {
                try {
                    const decrypted = decryptPollVote({ encPayload, encIv }, {
                        pollEncKey,
                        pollCreatorJid: creator,
                        pollMsgId,
                        voterJid: voter
                    });
                    if (decrypted && Array.isArray(decrypted.selectedOptions)) {
                        console.log(`[DECRYPT SUCCESS] Decrypted vote using creator=${creator}, voter=${voter}`);
                        return decrypted;
                    }
                } catch (e) {
                    // Try next combination
                }
            }
        }

        console.warn(`[DECRYPT FAILED] Tested ${cleanCreators.length} creators x ${cleanVoters.length} voters without success`);
        return null;
    }

    extractSelectedOptions(pollOptions, decryptedVote) {
        if (!decryptedVote || !decryptedVote.selectedOptions) return [];
        const userOptions = [];
        for (const optName of pollOptions) {
            const optHash = crypto.createHash('sha256').update(Buffer.from(optName)).digest();
            const isSelected = decryptedVote.selectedOptions.some(sel => {
                const selBuf = Buffer.isBuffer(sel) ? sel : Buffer.from(sel);
                return Buffer.compare(selBuf, optHash) === 0 || selBuf.toString('hex') === optHash.toString('hex');
            });
            if (isSelected) {
                userOptions.push(optName);
            }
        }
        return userOptions;
    }

    async getPollStats({ whatsappSocket, groupId, pollId }) {
        if (!whatsappSocket) {
            throw new Error('WhatsApp client is offline');
        }

        let pollOptions = [];
        const rawMessage = await pollRepository.getRawMessage(pollId);
        if (rawMessage) {
            pollOptions = this.extractPollOptions(rawMessage);
        }

        // Build complete set of bot identifiers (JIDs, LIDs, and pure phone digits)
        const botIdentifiers = new Set();
        if (whatsappSocket.user) {
            if (whatsappSocket.user.id) {
                const cleanId = whatsappSocket.user.id.split(':')[0];
                botIdentifiers.add(cleanId);
                botIdentifiers.add(cleanId.split('@')[0]);
                botIdentifiers.add(cleanId.split('@')[0].replace(/\D/g, ''));
            }
            if (whatsappSocket.user.lid) {
                const cleanLid = whatsappSocket.user.lid.split(':')[0];
                botIdentifiers.add(cleanLid);
                botIdentifiers.add(cleanLid.split('@')[0]);
                botIdentifiers.add(cleanLid.split('@')[0].replace(/\D/g, ''));
            }
        }

        const isBot = (idOrLid) => {
            if (!idOrLid) return false;
            const clean = String(idOrLid).split(':')[0];
            const base = clean.split('@')[0].replace(/\D/g, '');
            return botIdentifiers.has(clean) || botIdentifiers.has(clean.split('@')[0]) || (base && botIdentifiers.has(base));
        };

        const group = await whatsappSocket.groupMetadata(groupId);
        const membersMap = new Map();

        for (const p of group.participants || []) {
            const cleanId = p.id ? p.id.split(':')[0] : '';
            let cleanLid = p.lid ? p.lid.split(':')[0] : (cleanId.includes('@lid') ? cleanId : null);
            
            // Extract pure digits phone number if present
            let rawPhone = null;
            if (p.phoneNumber) {
                rawPhone = p.phoneNumber.split('@')[0].replace(/\D/g, '');
            } else if (!cleanId.includes('@lid')) {
                rawPhone = cleanId.split('@')[0].replace(/\D/g, '');
            }

            // Exclude bot
            if (isBot(cleanId) || isBot(cleanLid) || isBot(rawPhone)) {
                continue;
            }

            // Cross-reference with cache and repository to find missing phone or LID
            if (!cleanLid && rawPhone) {
                const mappedLid = contactCache.lidMap.get(`${rawPhone}@s.whatsapp.net`) || contactCache.lidMap.get(rawPhone);
                if (mappedLid) cleanLid = mappedLid;
            }
            if (!rawPhone && cleanLid) {
                const mappedPhone = contactCache.lidMap.get(cleanLid);
                if (mappedPhone) rawPhone = mappedPhone.split('@')[0].replace(/\D/g, '');
            }

            if (!rawPhone || !cleanLid) {
                const dbContact = await contactRepository.getByIdOrLid(cleanId || cleanLid);
                if (dbContact) {
                    if (!rawPhone && dbContact.phone_number) {
                        rawPhone = dbContact.phone_number.split('@')[0].replace(/\D/g, '');
                    }
                    if (!cleanLid && dbContact.lid) {
                        cleanLid = dbContact.lid.split(':')[0];
                    }
                }
            }

            // Register bidirectional mapping in cache
            if (cleanLid && rawPhone) {
                contactCache.lidMap.set(cleanLid, `${rawPhone}@s.whatsapp.net`);
                contactCache.lidMap.set(`${rawPhone}@s.whatsapp.net`, cleanLid);
            }

            // Determine canonical key: prefer phone number, fallback to LID
            const canonicalKey = rawPhone || cleanLid || cleanId;
            if (!canonicalKey) continue;

            // Check if already in membersMap
            let existing = membersMap.get(canonicalKey);
            if (!existing && cleanLid && membersMap.has(cleanLid)) {
                existing = membersMap.get(cleanLid);
            }
            if (!existing && rawPhone && membersMap.has(rawPhone)) {
                existing = membersMap.get(rawPhone);
            }

            // Resolve best display name
            let resolvedName = p.name || p.notify || null;
            if (!resolvedName && rawPhone) resolvedName = contactCache.get(`${rawPhone}@s.whatsapp.net`) || contactCache.get(rawPhone);
            if (!resolvedName && cleanLid) resolvedName = contactCache.get(cleanLid);
            if (!resolvedName) {
                const dbContact = await contactRepository.getByIdOrLid(rawPhone || cleanLid || cleanId);
                if (dbContact) resolvedName = dbContact.name || dbContact.notify;
            }

            if (existing) {
                if (!existing.phone && rawPhone) existing.phone = rawPhone;
                if (!existing.lid && cleanLid) existing.lid = cleanLid;
                if ((!existing.name || existing.name.startsWith('+') || existing.name === 'Hidden Contact') && resolvedName) {
                    existing.name = resolvedName;
                }
            } else {
                const newMember = {
                    id: rawPhone ? `${rawPhone}@s.whatsapp.net` : (cleanId || cleanLid),
                    lid: cleanLid,
                    phone: rawPhone,
                    name: resolvedName || (rawPhone ? `+${rawPhone}` : 'Hidden Contact'),
                    number: rawPhone ? `+${rawPhone}` : 'Hidden by WhatsApp'
                };
                membersMap.set(canonicalKey, newMember);
                if (rawPhone) membersMap.set(rawPhone, newMember);
                if (cleanLid) membersMap.set(cleanLid, newMember);
            }
        }

        // Unique deduplicated members
        const finalMembers = [...new Set(membersMap.values())];

        // Retrieve votes for this poll
        const votes = await voteRepository.getVotesByPollId(pollId);

        // Strict cryptographic matching of votes (NEVER by name!)
        const isVoteForMember = (v, m) => {
            const cleanVoterId = v.voter_id.split(':')[0];
            const baseVoter = cleanVoterId.split('@')[0].replace(/\D/g, '');

            if (cleanVoterId === m.id) return true;
            if (m.lid && cleanVoterId === m.lid) return true;
            if (m.phone && baseVoter && baseVoter === m.phone) return true;
            if (m.lid && baseVoter && baseVoter === m.lid.split('@')[0]) return true;

            const mapped = contactCache.lidMap.get(cleanVoterId);
            if (mapped) {
                if (mapped === m.id || mapped === m.lid) return true;
                if (m.phone && mapped.split('@')[0].replace(/\D/g, '') === m.phone) return true;
            }
            return false;
        };

        const stats = finalMembers.map(m => {
            const vote = votes.find(v => isVoteForMember(v, m));

            let parsedOptions = [];
            if (vote && vote.options) {
                try {
                    parsedOptions = typeof vote.options === 'string' ? JSON.parse(vote.options) : vote.options;
                } catch {
                    parsedOptions = [];
                }
            }

            const hasVoted = !!(vote && Array.isArray(parsedOptions) && parsedOptions.length > 0);
            const displayName = (vote && vote.voter_name && !vote.voter_name.startsWith('+')) ? vote.voter_name : m.name;

            return {
                id: m.id,
                lid: m.lid,
                name: displayName,
                number: m.number,
                hasVoted,
                options: hasVoted ? parsedOptions : [],
                timestamp: vote ? vote.timestamp : null
            };
        });

        // Also check if any voter who voted is not yet in groupMetadata
        for (const v of votes) {
            const cleanVoterId = v.voter_id.split(':')[0];
            if (isBot(cleanVoterId)) continue;

            const alreadyMatched = stats.some(s => isVoteForMember(v, s));
            if (!alreadyMatched) {
                let parsedOptions = [];
                try {
                    parsedOptions = typeof v.options === 'string' ? JSON.parse(v.options) : v.options;
                } catch {
                    parsedOptions = [];
                }
                const hasVoted = Array.isArray(parsedOptions) && parsedOptions.length > 0;
                const isLid = cleanVoterId.includes('@lid');
                const baseId = cleanVoterId.split('@')[0].replace(/\D/g, '');

                stats.push({
                    id: cleanVoterId,
                    lid: isLid ? cleanVoterId : null,
                    name: v.voter_name || contactCache.get(cleanVoterId) || (isLid ? 'Hidden Contact' : `+${baseId}`),
                    number: isLid ? 'Hidden by WhatsApp' : `+${baseId}`,
                    hasVoted,
                    options: hasVoted ? parsedOptions : [],
                    timestamp: v.timestamp || null
                });
            }
        }

        return { stats, pollOptions };
    }

    generateCsv(stats, pollTitle = 'Sondage') {
        const header = ['Nom', 'Numero', 'A_Vote', 'Reponses', 'Date_Vote'];
        const rows = stats.map(s => {
            const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
            return [
                escapeCsv(s.name),
                escapeCsv(s.number),
                s.hasVoted ? 'OUI' : 'NON',
                escapeCsv((s.options || []).join(' ; ')),
                escapeCsv(s.timestamp || '')
            ].join(',');
        });

        return [header.join(','), ...rows].join('\r\n');
    }

    async sendBulkReminders({ whatsappSocket, targetIds, targets = [], customMessage, delayMs = 1500, contactRepo = contactRepository }) {
        if (!whatsappSocket) {
            throw new Error('WhatsApp client is offline');
        }

        const targetMap = new Map();
        if (Array.isArray(targets)) {
            targets.forEach(t => {
                if (t && t.id) targetMap.set(t.id, t.name || '');
            });
        }

        const results = [];
        for (const targetId of targetIds) {
            try {
                let textToSend = customMessage;
                if (customMessage.includes('[Name]')) {
                    let memberName = targetMap.get(targetId);
                    if (!memberName && contactRepo && contactRepo.resolveBestName) {
                        memberName = await contactRepo.resolveBestName(targetId);
                    }
                    if (!memberName) {
                        memberName = contactCache.get(targetId) || '';
                    }

                    if (memberName) {
                        textToSend = customMessage.replace(/\[Name\]/g, memberName);
                    } else {
                        textToSend = customMessage.replace(/\s*\[Name\]\s*/g, ' ').replace(/\s+([,!?.:;])/g, '$1');
                    }
                    textToSend = textToSend.replace(/\s{2,}/g, ' ').trim();
                }

                await whatsappSocket.sendMessage(targetId, { text: textToSend });
                results.push({ targetId, status: 'sent' });
            } catch (err) {
                results.push({ targetId, status: 'failed', error: err.message });
            }

            if (delayMs > 0 && targetIds.indexOf(targetId) < targetIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return results;
    }
}

module.exports = new PollService();
module.exports.PollService = PollService;
module.exports.bufferReviver = bufferReviver;
