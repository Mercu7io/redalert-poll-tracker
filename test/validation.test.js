const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    loginCheckSchema,
    createPollSchema,
    remindSchema,
    bulkRemindSchema,
    updateContactNameSchema
} = require('../src/validators/schemas');

describe('Input Validation Schemas', () => {
    describe('loginCheckSchema', () => {
        it('validates a correct non-empty password', () => {
            const result = loginCheckSchema.safeParse({ password: 'validPassword123' });
            assert.equal(result.success, true);
        });

        it('rejects an empty password (edge case)', () => {
            const result = loginCheckSchema.safeParse({ password: '' });
            assert.equal(result.success, false);
        });
    });

    describe('createPollSchema', () => {
        it('validates a standard poll creation request', () => {
            const payload = {
                groupId: '123456789@g.us',
                title: 'Are you safe?',
                options: ['Yes', 'No', 'Need Help'],
                selectableCount: 1
            };
            const result = createPollSchema.safeParse(payload);
            assert.equal(result.success, true);
            assert.equal(result.data.selectableCount, 1);
        });

        it('rejects a poll with fewer than 2 options (edge case)', () => {
            const payload = {
                groupId: '123456789@g.us',
                title: 'Single option poll',
                options: ['Only One Option']
            };
            const result = createPollSchema.safeParse(payload);
            assert.equal(result.success, false);
        });

        it('rejects an empty title (edge case)', () => {
            const payload = {
                groupId: '123456789@g.us',
                title: '',
                options: ['A', 'B']
            };
            const result = createPollSchema.safeParse(payload);
            assert.equal(result.success, false);
        });
    });

    describe('bulkRemindSchema', () => {
        it('validates bulk reminder payload with multiple targets', () => {
            const payload = {
                targetIds: ['123@s.whatsapp.net', '456@s.whatsapp.net'],
                customMessage: 'Please respond to the poll',
                delayMs: 1500
            };
            const result = bulkRemindSchema.safeParse(payload);
            assert.equal(result.success, true);
            assert.equal(result.data.targetIds.length, 2);
        });

        it('rejects an empty targetIds array (edge case)', () => {
            const payload = {
                targetIds: [],
                customMessage: 'Reminder'
            };
            const result = bulkRemindSchema.safeParse(payload);
            assert.equal(result.success, false);
        });
    });

    describe('updateContactNameSchema', () => {
        it('validates a correct custom name update', () => {
            const payload = {
                id: '33612345678@s.whatsapp.net',
                customName: 'Jean Dupont'
            };
            const result = updateContactNameSchema.safeParse(payload);
            assert.equal(result.success, true);
            assert.equal(result.data.customName, 'Jean Dupont');
        });

        it('rejects an empty custom name (edge case)', () => {
            const payload = {
                id: '33612345678@s.whatsapp.net',
                customName: '   '
            };
            const result = updateContactNameSchema.safeParse(payload);
            assert.equal(result.success, false);
        });

        it('rejects an overly long custom name exceeding 100 chars (edge case)', () => {
            const payload = {
                id: '33612345678@s.whatsapp.net',
                customName: 'A'.repeat(105)
            };
            const result = updateContactNameSchema.safeParse(payload);
            assert.equal(result.success, false);
        });
    });
});

