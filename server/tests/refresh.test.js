/** Integration tests for access + refresh tokens. Needs TEST_DATABASE_URL (tables are wiped). */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');

describeDb('access + refresh tokens', () => {
    const app = require('../src/app');
    const db = require('../src/db');
    const migrate = require('../src/db/migrate');
    const mailer = require('../src/services/mailer');

    const email = 'a@test.com';
    const credentials = { name: 'Asha', email, password: 'password123' };

    const refreshCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('sweety_refresh='));
    const cookieHeader = (setCookie) => setCookie.split(';')[0]; // "sweety_refresh=<value>"
    const refresh = (cookie) => {
        const req = request(app).post('/api/auth/refresh');
        return cookie ? req.set('Cookie', cookie) : req;
    };
    const login = () => request(app).post('/api/auth/login').send({ email, password: credentials.password });

    beforeAll(migrate);
    beforeEach(async () => {
        await db.query('TRUNCATE readings, users RESTART IDENTITY CASCADE');
        await request(app).post('/api/auth/register').send(credentials);
    });
    afterAll(() => db.pool.end());

    test('login returns a 15-minute access token and an httpOnly refresh cookie', async () => {
        const res = await login();
        const decoded = jwt.decode(res.body.token);
        expect(decoded.exp - decoded.iat).toBe(900);
        expect(res.body.refreshToken).toBeUndefined(); // never in the JSON body

        const cookie = refreshCookie(res);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).toMatch(/Path=\/api\/auth/);
    });

    test('only a hash of the refresh token is stored', async () => {
        const res = await login();
        const raw = cookieHeader(refreshCookie(res)).split('=')[1];
        const { rows } = await db.query('SELECT token_hash FROM refresh_tokens');
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.token_hash !== raw && r.token_hash.length === 64)).toBe(true);
    });

    test('refresh returns a new access token and rotates the cookie', async () => {
        const first = cookieHeader(refreshCookie(await login()));
        const res = await refresh(first);
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.email).toBe(email);

        const second = cookieHeader(refreshCookie(res));
        expect(second).not.toBe(first);

        const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
        expect(me.status).toBe(200);
    });

    test('refresh without a cookie is rejected', async () => {
        expect((await refresh()).status).toBe(401);
    });

    test('a rotated token cannot be reused, and a long-ago reuse revokes every session', async () => {
        const first = cookieHeader(refreshCookie(await login()));
        const rotated = await refresh(first);
        const second = cookieHeader(refreshCookie(rotated));

        // Immediately after rotation: just rejected (grace period for two tabs racing).
        expect((await refresh(first)).status).toBe(401);
        expect((await refresh(second)).status).toBe(200);

        // Reuse long after rotation means the old token leaked: everything is revoked.
        await db.query("UPDATE refresh_tokens SET revoked_at = NOW() - interval '1 minute' WHERE revoked_at IS NOT NULL");
        expect((await refresh(first)).status).toBe(401);
        const latest = cookieHeader(refreshCookie(await login()));
        await db.query("UPDATE refresh_tokens SET revoked_at = NOW() - interval '1 minute' WHERE revoked_at IS NOT NULL");
        expect((await refresh(first)).status).toBe(401);
        expect((await refresh(latest)).status).toBe(401);
    });

    test('expired refresh token is rejected', async () => {
        const cookie = cookieHeader(refreshCookie(await login()));
        await db.query("UPDATE refresh_tokens SET expires_at = NOW() - interval '1 minute'");
        expect((await refresh(cookie)).status).toBe(401);
    });

    test('logout revokes the refresh token and clears the cookie', async () => {
        const cookie = cookieHeader(refreshCookie(await login()));
        const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
        expect(out.status).toBe(204);
        expect(refreshCookie(out)).toMatch(/sweety_refresh=;/);
        expect((await refresh(cookie)).status).toBe(401);
    });

    test('resetting the password signs out every device', async () => {
        const spy = jest.spyOn(mailer, 'sendResetLink').mockResolvedValue();
        const cookie = cookieHeader(refreshCookie(await login()));

        await request(app).post('/api/auth/forgot-password').send({ email });
        const token = spy.mock.calls.at(-1)[1].split('reset=')[1];
        spy.mockRestore();
        const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword9' });
        expect(reset.status).toBe(200);

        expect((await refresh(cookie)).status).toBe(401);
    });
});