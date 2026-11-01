const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createApp } = require('../src/app');
const { initDatabase, closeDatabase } = require('../src/database/db');
const config = require('../src/config/env');

describe('API Routes Integration', () => {
    let server;
    let baseUrl;

    before(async () => {
        await initDatabase(':memory:');
        const app = createApp();
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        await new Promise((resolve) => server.close(resolve));
        await closeDatabase();
    });

    it('POST /api/login-check succeeds with correct password', async () => {
        const res = await fetch(`${baseUrl}/api/login-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: config.APP_PASSWORD })
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
    });

    it('POST /api/login-check fails with invalid password (edge case)', async () => {
        const res = await fetch(`${baseUrl}/api/login-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'wrongPassword!' })
        });

        assert.equal(res.status, 401);
        const body = await res.json();
        assert.equal(body.success, false);
    });

    it('blocks access to protected endpoints without auth header (edge case)', async () => {
        const res = await fetch(`${baseUrl}/api/status`);
        assert.equal(res.status, 401);
    });

    it('returns validation error (400) when creating poll with missing options (edge case)', async () => {
        const res = await fetch(`${baseUrl}/api/polls/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-app-password': config.APP_PASSWORD
            },
            body: JSON.stringify({
                groupId: '123456@g.us',
                title: 'Test',
                options: [] // invalid: min 2 options
            })
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.error, 'Validation Error');
        assert.ok(body.details.length > 0);
    });

    it('returns validation error (400) when bulk reminder payload has empty targetIds', async () => {
        const res = await fetch(`${baseUrl}/api/remind-bulk`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-app-password': config.APP_PASSWORD
            },
            body: JSON.stringify({
                targetIds: [],
                customMessage: 'Hello'
            })
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.error, 'Validation Error');
    });

    it('POST /api/contacts/update-name updates a contact name successfully', async () => {
        const res = await fetch(`${baseUrl}/api/contacts/update-name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-app-password': config.APP_PASSWORD
            },
            body: JSON.stringify({
                id: '33612340000@s.whatsapp.net',
                customName: 'Capitaine Haddock'
            })
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.contact.name, 'Capitaine Haddock');
    });

    it('POST /api/contacts/update-name returns 400 on empty customName (edge case)', async () => {
        const res = await fetch(`${baseUrl}/api/contacts/update-name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-app-password': config.APP_PASSWORD
            },
            body: JSON.stringify({
                id: '33612340000@s.whatsapp.net',
                customName: ''
            })
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.error, 'Validation Error');
    });
});

