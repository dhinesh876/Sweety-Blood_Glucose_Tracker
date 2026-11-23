/** Integration tests for password rules + forgot/reset flow. Needs TEST_DATABASE_URL (tables are wiped). */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');

describeDb('password rules and reset flow', () => {
    const app = require('../src/app');
    const db = require('../src/db');
    const migrate = require('../src/db/migrate');
    const mailer = require('../src/services/mailer');

    let sendSpy;
    const email = 'a@test.com';
    const register = (body = {}) =>
        request(app).post('/api/auth/register').send({ name: 'Asha', email, password: 'password123', ...body });
    const login = (password) => request(app).post('/api/auth/login').send({ email, password });
    const forgot = (e = email) => request(app).post('/api/auth/forgot-password').send({ email: e });
    const reset = (token, password) => request(app).post('/api/auth/reset-password').send({ token, password });
    const lastToken = () => sendSpy.mock.calls.at(-1)[1].split('reset=')[1];

    beforeAll(migrate);
    beforeEach(async () => {
        await db.query('TRUNCATE readings, users RESTART IDENTITY CASCADE');
        sendSpy = jest.spyOn(mailer, 'sendResetLink').mockResolvedValue();
        await register();
    });
    afterEach(() => sendSpy.mockRestore());
    afterAll(() => db.pool.end());

    test.each(['short1', 'onlyletters', '12345678'])('register rejects weak password %p', async (password) => {
        const res = await register({ email: 'x@test.com', password });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/at least 8 characters/);
    });

    test('forgot-password gives the same answer for known and unknown emails', async () => {
        const known = await forgot();
        const unknown = await forgot('nobody@test.com');
        expect(known.status).toBe(200);
        expect(unknown.body).toEqual(known.body);
        expect(sendSpy).toHaveBeenCalledTimes(1); // only the real account gets a link
    });

    test('stores only a hash of the token', async () => {
        await forgot();
        const token = lastToken();
        const { rows } = await db.query('SELECT token_hash FROM password_resets');
        expect(rows).toHaveLength(1);
        expect(rows[0].token_hash).not.toBe(token);
        expect(rows[0].token_hash).toHaveLength(64);
    });

    test('valid token changes the password; old password stops working', async () => {
        await forgot();
        const res = await reset(lastToken(), 'newpassword9');
        expect(res.status).toBe(200);
        expect((await login('newpassword9')).status).toBe(200);
        expect((await login('password123')).status).toBe(401);
    });

    test('token is single-use', async () => {
        await forgot();
        const token = lastToken();
        expect((await reset(token, 'newpassword9')).status).toBe(200);
        const again = await reset(token, 'anotherpass8');
        expect(again.status).toBe(400);
        expect(again.body.message).toBe('This reset link is invalid or has expired.');
    });

    test('expired token is rejected', async () => {
        await forgot();
        await db.query("UPDATE password_resets SET expires_at = NOW() - interval '1 minute'");
        expect((await reset(lastToken(), 'newpassword9')).status).toBe(400);
    });

    test('wrong token is rejected', async () => {
        await forgot();
        expect((await reset('not-the-token', 'newpassword9')).status).toBe(400);
    });

    test('weak new password is rejected without burning the token', async () => {
        await forgot();
        const token = lastToken();
        expect((await reset(token, 'weak')).status).toBe(400);
        expect((await reset(token, 'newpassword9')).status).toBe(200);
    });

    test('requesting a new link invalidates the previous one', async () => {
        await forgot();
        const first = lastToken();
        await forgot();
        expect((await reset(first, 'newpassword9')).status).toBe(400);
        expect((await reset(lastToken(), 'newpassword9')).status).toBe(200);
    });
});