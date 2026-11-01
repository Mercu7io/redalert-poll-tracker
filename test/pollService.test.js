const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { proto } = require('@whiskeysockets/baileys');
const pollService = require('../src/services/pollService');

describe('PollService', () => {
    describe('extractPollOptions', () => {
        it('extracts options from standard Baileys poll creation message', () => {
            const rawMsg = JSON.stringify({
                message: {
                    pollCreationMessage: {
                        name: 'Status check',
                        options: [
                            { optionName: 'Safe' },
                            { optionName: 'Need assistance' }
                        ]
                    }
                }
            });

            const options = pollService.extractPollOptions(rawMsg);
            assert.deepEqual(options, ['Safe', 'Need assistance']);
        });

        it('returns empty array when raw message is invalid or corrupt (edge case)', () => {
            assert.deepEqual(pollService.extractPollOptions('invalid-json'), []);
            assert.deepEqual(pollService.extractPollOptions(''), []);
            assert.deepEqual(pollService.extractPollOptions(null), []);
        });
    });

    describe('generateCsv', () => {
        it('formats statistics into valid RFC-compliant CSV rows', () => {
            const stats = [
                {
                    name: 'Alice Dupont',
                    number: '+33611223344',
                    hasVoted: true,
                    options: ['Yes'],
                    timestamp: '2026-11-01 12:00:00'
                },
                {
                    name: 'Bob "The Builder" Martin',
                    number: '+33699887766',
                    hasVoted: false,
                    options: [],
                    timestamp: null
                }
            ];

            const csv = pollService.generateCsv(stats, 'Safety Drill');
            assert.ok(csv.includes('Nom,Numero,A_Vote,Reponses,Date_Vote'));
            assert.ok(csv.includes('"Alice Dupont","+33611223344",OUI,"Yes","2026-11-01 12:00:00"'));
            assert.ok(csv.includes('"Bob ""The Builder"" Martin","+33699887766",NON,"",""'));
        });

        it('handles empty stats gracefully (edge case)', () => {
            const csv = pollService.generateCsv([]);
            assert.equal(csv, 'Nom,Numero,A_Vote,Reponses,Date_Vote');
        });
    });

    describe('decryptVote and extractSelectedOptions', () => {
        it('decrypts encrypted poll vote and extracts selected options correctly', () => {
            const pollMsgId = 'POLL_MSG_123';
            const pollCreatorJid = '33611110001@s.whatsapp.net';
            const voterJid = '11100000000001@lid';
            const pollEncKey = crypto.randomBytes(32);

            const options = ['Yes', 'Need help', 'No siren'];
            const helpHash = crypto.createHash('sha256').update(Buffer.from('Need help')).digest();

            // Encode vote message proto
            const voteMsg = proto.Message.PollVoteMessage.encode({
                selectedOptions: [helpHash]
            }).finish();

            // Encrypt matching WhatsApp protocol
            const sign = Buffer.concat([
                Buffer.from(pollMsgId),
                Buffer.from(pollCreatorJid),
                Buffer.from(voterJid),
                Buffer.from('Poll Vote'),
                new Uint8Array([1])
            ]);
            const key0 = crypto.createHmac('sha256', new Uint8Array(32)).update(pollEncKey).digest();
            const decKey = crypto.createHmac('sha256', key0).update(sign).digest();
            const aad = Buffer.from(`${pollMsgId}\u0000${voterJid}`);
            const encIv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', decKey, encIv);
            cipher.setAAD(aad);
            const encPayload = Buffer.concat([cipher.update(voteMsg), cipher.final(), cipher.getAuthTag()]);

            const originalMsg = {
                key: { id: pollMsgId, fromMe: true },
                message: {
                    messageContextInfo: { messageSecret: pollEncKey.toString('base64') },
                    pollCreationMessageV3: {
                        name: 'Are you safe?',
                        options: options.map(o => ({ optionName: o }))
                    }
                }
            };

            const pollUpdate = {
                vote: { encPayload, encIv }
            };

            const decrypted = pollService.decryptVote({
                pollUpdate,
                originalMsg,
                voterJid,
                botUser: { id: pollCreatorJid }
            });

            assert.ok(decrypted);
            assert.equal(decrypted.selectedOptions.length, 1);

            const selected = pollService.extractSelectedOptions(options, decrypted);
            assert.deepEqual(selected, ['Need help']);
        });

        it('returns null if messageSecret or vote is missing (edge case)', () => {
            const result1 = pollService.decryptVote({
                pollUpdate: null,
                originalMsg: {}
            });
            assert.equal(result1, null);

            const result2 = pollService.decryptVote({
                pollUpdate: { vote: {} },
                originalMsg: { message: {} }
            });
            assert.equal(result2, null);
        });
    });

    describe('getPollStats', () => {
        it('deduplicates participants, excludes bot, and matches votes strictly by ID without name leakage', async () => {
            const fakePollId = 'POLL_TEST_STATS';
            const fakeGroupId = '123456789@g.us';

            const mockSocket = {
                user: {
                    id: '33699990001:85@s.whatsapp.net',
                    lid: '99900000000001:85@lid'
                },
                async groupMetadata() {
                    return {
                        participants: [
                            // 1. The Bot (LID)
                            { id: '99900000000001@lid', phoneNumber: '33699990001@s.whatsapp.net' },
                            // 2. John Doe (Phone JID)
                            { id: '33611110001@s.whatsapp.net', name: 'John Doe' },
                            // 3. John Doe (Duplicate LID entry in group)
                            { id: '11100000000001@lid', phoneNumber: '33611110001@s.whatsapp.net' },
                            // 4. Another user with same name "John Doe" but different phone
                            { id: '33611112222@s.whatsapp.net', name: 'John Doe', phoneNumber: '33611112222' }
                        ]
                    };
                }
            };

            // Mock poll raw message
            const { initDatabase, closeDatabase } = require('../src/database/db');
            await initDatabase(':memory:');

            const pollRepo = require('../src/repositories/pollRepository');
            const voteRepo = require('../src/repositories/voteRepository');
            await pollRepo.create({
                id: fakePollId,
                groupId: fakeGroupId,
                title: 'Drill',
                rawMessage: JSON.stringify({
                    message: {
                        pollCreationMessage: {
                            name: 'Drill',
                            options: [{ optionName: 'Yes' }, { optionName: 'Need help' }]
                        }
                    }
                })
            });

            // Vote only recorded for the first John Doe (33611110001 / 11100000000001@lid)
            await voteRepo.saveVote({
                pollId: fakePollId,
                voterId: '11100000000001@lid',
                voterName: 'John Doe',
                options: ['Need help']
            });

            const { stats } = await pollService.getPollStats({
                whatsappSocket: mockSocket,
                groupId: fakeGroupId,
                pollId: fakePollId
            });

            // 1. Bot must NOT be in stats
            assert.ok(!stats.some(s => s.id.includes('33699990001') || s.id.includes('99900000000001')));

            // 2. John Doe must be deduplicated into EXACTLY ONE entry (not 2)
            const johnEntries = stats.filter(s => s.number === '+33611110001');
            assert.equal(johnEntries.length, 1);
            assert.equal(johnEntries[0].hasVoted, true);
            assert.deepEqual(johnEntries[0].options, ['Need help']);

            // 3. The second John (33611112222) must NOT have received first John's vote!
            const secondJohn = stats.find(s => s.number === '+33611112222');
            assert.ok(secondJohn);
            assert.equal(secondJohn.hasVoted, false);
            assert.deepEqual(secondJohn.options, []);

            // 4. Total participants: exactly 2 real members
            assert.equal(stats.length, 2);

            await closeDatabase();
        });
    });
});

