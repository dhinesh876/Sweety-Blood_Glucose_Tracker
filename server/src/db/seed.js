const bcrypt = require('bcryptjs');
const db = require('./index');
const migrate = require('./migrate');
const { todayString } = require('../utils/dates');

const DEMO = { name: 'Demo Patient', email: 'demo@sweety.app', password: 'Demo@1234' };
const DAYS_BACK = 75; // covers the current month and the whole previous month

function dateMinus(todayStr, days) {
  const [y, m, d] = todayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86400000).toISOString().slice(0, 10);
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

async function seed() {
  await migrate();
  const hash = await bcrypt.hash(DEMO.password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [DEMO.name, DEMO.email, hash]
  );
  const userId = rows[0].id;
  await db.query('DELETE FROM readings WHERE user_id = $1', [userId]);

  const base = { morning: 105, after_breakfast: 150, after_lunch: 140, after_dinner: 135 };
  const today = todayString();
  let inserted = 0;

  for (let i = 0; i < DAYS_BACK; i++) {
    const date = dateMinus(today, i);
    const slots = ['morning', 'after_breakfast'];
    if (i % 2 === 0) slots.push('after_lunch');
    if (i % 3 !== 0) slots.push('after_dinner');

    for (const slot of slots) {
      const wobble = Math.round(Math.sin(i * 1.7 + slot.length) * 25 + ((i * 7) % 15));
      const value = clamp(base[slot] + wobble, 70, 260);
      await db.query(
        `INSERT INTO readings (user_id, reading_date, slot, value) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, reading_date, slot) DO NOTHING`,
        [userId, date, slot, value]
      );
      inserted++;
    }
  }
  console.log(`Seeded ${inserted} readings for ${DEMO.email} (password: ${DEMO.password})`);
}

seed()
  .then(() => db.pool.end())
  .catch((err) => { console.error(err); process.exit(1); });
