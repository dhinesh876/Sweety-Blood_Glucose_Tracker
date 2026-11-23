/**
 * Integration tests — need a real PostgreSQL database.
 * Set TEST_DATABASE_URL (this database's tables are WIPED). Skipped otherwise.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');

describeDb('Sweety API', () => {
  const app = require('../src/app');
  const db = require('../src/db');
  const migrate = require('../src/db/migrate');

  const D = '2025-10-15'; // fixed past dates so tests never hit the "future" rule
  let token;

  const register = (email = 'a@test.com', name = 'Asha') =>
    request(app).post('/api/auth/register').send({ name, email, password: 'password123' });
  const add = (body, t = token) =>
    request(app).post('/api/readings').set('Authorization', `Bearer ${t}`).send(body);

  beforeAll(migrate);
  beforeEach(async () => {
    await db.query('TRUNCATE readings, users RESTART IDENTITY CASCADE');
    token = (await register()).body.token;
  });
  afterAll(() => db.pool.end());

  describe('auth', () => {
    test('stores a bcrypt hash, never the plain password', async () => {
      const { rows } = await db.query('SELECT password_hash FROM users WHERE email = $1', ['a@test.com']);
      expect(rows[0].password_hash).not.toBe('password123');
      expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    });

    test('login works, wrong password rejected, duplicate email rejected', async () => {
      const good = await request(app).post('/api/auth/login').send({ email: 'a@test.com', password: 'password123' });
      expect(good.status).toBe(200);
      expect(good.body.token).toBeTruthy();
      const bad = await request(app).post('/api/auth/login').send({ email: 'a@test.com', password: 'wrongwrong' });
      expect(bad.status).toBe(401);
      expect((await register()).status).toBe(409);
    });

    test('readings require a token', async () => {
      expect((await request(app).get('/api/readings')).status).toBe(401);
    });
  });

  describe('readings', () => {
    test('create, list, edit, delete', async () => {
      const created = await add({ date: D, slot: 'morning', value: 110 });
      expect(created.status).toBe(201);

      const list = await request(app).get('/api/readings').set('Authorization', `Bearer ${token}`);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.pagination.total).toBe(1);

      const edited = await request(app).put(`/api/readings/${created.body.id}`)
        .set('Authorization', `Bearer ${token}`).send({ value: 130 });
      expect(edited.status).toBe(200);
      expect(edited.body.value).toBe(130);

      const del = await request(app).delete(`/api/readings/${created.body.id}`).set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(204);
    });

    test('validation messages', async () => {
      expect((await add({ date: D, slot: 'morning' })).body.message).toBe('Please enter a glucose value.');
      expect((await add({ date: D, slot: 'morning', value: 20 })).body.message).toBe('Value must be between 40 and 600 mg/dl.');
      expect((await add({ date: '2999-01-01', slot: 'morning', value: 100 })).body.message).toBe('Date cannot be in the future.');
    });

    test('one reading per slot per day', async () => {
      await add({ date: D, slot: 'after_lunch', value: 140 });
      const dup = await add({ date: D, slot: 'after_lunch', value: 150 });
      expect(dup.status).toBe(409);
      expect(dup.body.message).toBe('You already have an After lunch reading for this date.');
    });

    test('maximum 4 readings per day', async () => {
      for (const slot of ['morning', 'after_breakfast', 'after_lunch', 'after_dinner']) {
        expect((await add({ date: D, slot, value: 100 })).status).toBe(201);
      }
      const fifth = await add({ date: D, slot: 'morning', value: 100 });
      expect(fifth.status).toBe(409);
      expect(fifth.body.message).toBe('You can add only 4 readings per day.');
    });

    test('editing into an occupied slot is rejected', async () => {
      await add({ date: D, slot: 'morning', value: 100 });
      const b = await add({ date: D, slot: 'after_lunch', value: 100 });
      const res = await request(app).put(`/api/readings/${b.body.id}`)
        .set('Authorization', `Bearer ${token}`).send({ slot: 'morning' });
      expect(res.status).toBe(409);
    });

    test('users only see and modify their own readings', async () => {
      const mine = await add({ date: D, slot: 'morning', value: 100 });
      const other = (await register('b@test.com', 'Bala')).body.token;

      const list = await request(app).get('/api/readings').set('Authorization', `Bearer ${other}`);
      expect(list.body.data).toHaveLength(0);
      const put = await request(app).put(`/api/readings/${mine.body.id}`)
        .set('Authorization', `Bearer ${other}`).send({ value: 200 });
      expect(put.status).toBe(404);
      const del = await request(app).delete(`/api/readings/${mine.body.id}`).set('Authorization', `Bearer ${other}`);
      expect(del.status).toBe(404);
    });

    test('pagination', async () => {
      for (const day of ['01', '02', '03']) await add({ date: `2025-10-${day}`, slot: 'morning', value: 100 });
      const res = await request(app).get('/api/readings?page=2&limit=2').set('Authorization', `Bearer ${token}`);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    });
  });

  describe('reports', () => {
    test('daily, month-to-date and previous-month stats', async () => {
      await add({ date: '2025-10-15', slot: 'morning', value: 100 });
      await add({ date: '2025-10-15', slot: 'after_lunch', value: 200 });
      await add({ date: '2025-10-01', slot: 'morning', value: 60 });
      await add({ date: '2025-09-10', slot: 'morning', value: 300 });
      await add({ date: '2025-09-30', slot: 'morning', value: 150 });
      await add({ date: '2025-08-31', slot: 'morning', value: 500 }); // outside every range

      const res = await request(app).get('/api/reports?date=2025-10-15').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.daily).toMatchObject({ count: 2, highest: 200, lowest: 100, average: 150, empty: false });
      expect(res.body.daily.readings.map((r) => r.slot)).toEqual(['morning', 'after_lunch']);
      expect(res.body.monthToDate).toMatchObject({ count: 3, highest: 200, lowest: 60, average: 120 });
      expect(res.body.monthly).toMatchObject({
        range: { from: '2025-09-01', to: '2025-09-30' }, count: 2, highest: 300, lowest: 150, average: 225,
      });
    });

    test('average is rounded to 1 decimal', async () => {
      await add({ date: D, slot: 'morning', value: 100 });
      await add({ date: D, slot: 'after_breakfast', value: 101 });
      await add({ date: D, slot: 'after_lunch', value: 101 });
      const res = await request(app).get(`/api/reports?date=${D}`).set('Authorization', `Bearer ${token}`);
      expect(res.body.daily.average).toBe(100.7);
    });

    test('empty state when there are no readings', async () => {
      const res = await request(app).get(`/api/reports?date=${D}`).set('Authorization', `Bearer ${token}`);
      expect(res.body.daily).toMatchObject({ count: 0, empty: true, highest: null, readings: [] });
    });

    test('future report date rejected', async () => {
      const res = await request(app).get('/api/reports?date=2999-01-01').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });
  });
});
