const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initDatabase, closeDatabase } = require('../src/database/db');
const pollRepository = require('../src/repositories/pollRepository');
const voteRepository = require('../src/repositories/voteRepository');
const contactRepository = require('../src/repositories/contactRepository');

describe('Database Repositories with in-memory SQLite', () => {
    before(async () => {
        await initDatabase(':memory:');
    });

    after(async () => {
        await closeDatabase();
    });

    describe('PollRepository', () => {
        it('creates and retrieves a poll', async () => {
            const poll = {
                id: 'poll-123',
                groupId: 'group-abc@g.us',
                title: 'Security Drill',
                rawMessage: JSON.stringify({ test: 1 })
            };

            const created = await pollRepository.create(poll);
            assert.equal(created.changes, 1);

            const found = await pollRepository.getById('poll-123');
            assert.ok(found);
            assert.equal(found.id, 'poll-123');
            assert.equal(found.title, 'Security Drill');

            const raw = await pollRepository.getRawMessage('poll-123');
            assert.equal(raw, poll.rawMessage);
        });

        it('ignores duplicate poll insertion without crashing (edge case)', async () => {
            const poll = {
                id: 'poll-123',
                groupId: 'group-abc@g.us',
                title: 'Security Drill Duplicate',
                rawMessage: JSON.stringify({ test: 2 })
            };

            const result = await pollRepository.create(poll);
            assert.equal(result.changes, 0); // Ignored due to PRIMARY KEY
        });

        it('returns empty array when group has no polls (edge case)', async () => {
            const list = await pollRepository.getByGroupId('non-existent-group');
            assert.deepEqual(list, []);
        });
    });

    describe('VoteRepository', () => {
        it('saves a vote with voterName and retrieves votes for a poll', async () => {
            await voteRepository.saveVote({
                pollId: 'poll-123',
                voterId: 'voter-1@s.whatsapp.net',
                voterName: 'Alice Dupont',
                options: ['Yes']
            });

            const votes = await voteRepository.getVotesByPollId('poll-123');
            assert.equal(votes.length, 1);
            assert.equal(votes[0].voter_id, 'voter-1@s.whatsapp.net');
            assert.equal(votes[0].voter_name, 'Alice Dupont');
            assert.equal(votes[0].options, '["Yes"]');
        });

        it('updates an existing vote and preserves or updates voterName (edge case)', async () => {
            await voteRepository.saveVote({
                pollId: 'poll-123',
                voterId: 'voter-1@s.whatsapp.net',
                voterName: 'Alice D.',
                options: ['Need help']
            });

            const votes = await voteRepository.getVotesByPollId('poll-123');
            assert.equal(votes.length, 1); // Not duplicated
            assert.equal(votes[0].voter_name, 'Alice D.');
            assert.equal(votes[0].options, '["Need help"]');
        });
    });

    describe('ContactRepository', () => {
        it('upserts a contact with ID, LID, and names', async () => {
            await contactRepository.upsertContact({
                id: '33611223344@s.whatsapp.net',
                lid: '9988776655@lid',
                phoneNumber: '33611223344',
                name: 'Bob Martin',
                notify: 'Bob'
            });

            const byId = await contactRepository.getByIdOrLid('33611223344@s.whatsapp.net');
            assert.ok(byId);
            assert.equal(byId.name, 'Bob Martin');
            assert.equal(byId.lid, '9988776655@lid');

            // Find via LID
            const byLid = await contactRepository.getByIdOrLid('9988776655@lid');
            assert.ok(byLid);
            assert.equal(byLid.id, '33611223344@s.whatsapp.net');
        });

        it('resolves best name with fallback priority', async () => {
            const name = await contactRepository.resolveBestName('9988776655@lid');
            assert.equal(name, 'Bob Martin');
        });

        it('returns null for unknown identifier (edge case)', async () => {
            const unknown = await contactRepository.getByIdOrLid('unknown-id');
            assert.equal(unknown, null);
        });

        it('handles bulkUpsert without error (edge case)', async () => {
            await contactRepository.bulkUpsert([
                { id: '111@s.whatsapp.net', name: 'User 1' },
                { id: '222@s.whatsapp.net', notify: 'User 2' }
            ]);

            const c1 = await contactRepository.getByIdOrLid('111@s.whatsapp.net');
            const c2 = await contactRepository.getByIdOrLid('222@s.whatsapp.net');
            assert.equal(c1.name, 'User 1');
            assert.equal(c2.notify, 'User 2');
        });

        it('manually updates contact name and updates corresponding votes in SQLite', async () => {
            // First save a vote with old name
            await voteRepository.saveVote({
                pollId: 'poll-123',
                voterId: '33699990000@s.whatsapp.net',
                voterName: 'Old Name',
                options: ['Yes']
            });

            // Update custom name via repository
            const res = await contactRepository.updateCustomName('33699990000@s.whatsapp.net', 'New Custom Name');
            assert.equal(res.name, 'New Custom Name');

            // Verify contact name was updated
            const updatedContact = await contactRepository.getByIdOrLid('33699990000@s.whatsapp.net');
            assert.equal(updatedContact.name, 'New Custom Name');

            // Verify vote was updated in votes table
            const vote = await voteRepository.getVote('poll-123', '33699990000@s.whatsapp.net');
            assert.equal(vote.voter_name, 'New Custom Name');
        });
    });
});
