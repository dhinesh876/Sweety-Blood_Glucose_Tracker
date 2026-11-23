const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../utils/errors');
const { isValidDateString } = require('../utils/dates');
const { validateReadingInput, firstError } = require('../services/readingValidation');
const { SLOTS, SLOT_ORDER_SQL, MAX_READINGS_PER_DAY, MESSAGES, duplicateMessage } = require('../constants');

const router = express.Router();
router.use(auth);

const COLS = 'id, reading_date, slot, value, created_at, updated_at';
const toDto = (r) => ({
  id: r.id,
  date: r.reading_date,
  slot: r.slot,
  slotLabel: SLOTS[r.slot],
  value: r.value,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function parseId(raw) {
  if (!/^\d+$/.test(raw)) throw new HttpError(404, 'Reading not found.');
  return Number(raw);
}

function validateOrThrow(input) {
  const { errors, clean } = validateReadingInput(input);
  if (Object.keys(errors).length) throw new HttpError(400, firstError(errors), errors);
  return clean;
}

// Business rules that need the database. `excludeId` lets edits ignore the row being edited.
async function assertSlotAvailable(userId, date, slot, excludeId = null) {
  const { rows } = await db.query(
    'SELECT slot FROM readings WHERE user_id = $1 AND reading_date = $2 AND ($3::int IS NULL OR id <> $3)',
    [userId, date, excludeId]
  );
  if (rows.length >= MAX_READINGS_PER_DAY) throw new HttpError(409, MESSAGES.maxPerDay);
  if (rows.some((r) => r.slot === slot)) throw new HttpError(409, duplicateMessage(slot));
}

// GET /api/readings?page=1&limit=20&date=&from=&to=&order=asc|desc
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 200);

  const where = ['user_id = $1'];
  const params = [req.user.id];
  const filters = [['date', '=', req.query.date], ['from', '>=', req.query.from], ['to', '<=', req.query.to]];
  for (const [name, op, val] of filters) {
    if (val === undefined) continue;
    if (!isValidDateString(val)) throw new HttpError(400, `Invalid ${name}. Use YYYY-MM-DD.`);
    params.push(val);
    where.push(`reading_date ${op} $${params.length}`);
  }
  const dir = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const whereSql = where.join(' AND ');

  const total = (await db.query(`SELECT COUNT(*)::int AS n FROM readings WHERE ${whereSql}`, params)).rows[0].n;
  const { rows } = await db.query(
    `SELECT ${COLS} FROM readings WHERE ${whereSql}
      ORDER BY reading_date ${dir}, ${SLOT_ORDER_SQL} ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit]
  );

  res.json({
    data: rows.map(toDto),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const clean = validateOrThrow(req.body || {});
  await assertSlotAvailable(req.user.id, clean.date, clean.slot);
  try {
    const { rows } = await db.query(
      `INSERT INTO readings (user_id, reading_date, slot, value)
       VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
      [req.user.id, clean.date, clean.slot, clean.value]
    );
    res.status(201).json(toDto(rows[0]));
  } catch (err) {
    // Two simultaneous requests can both pass the check above; the UNIQUE constraint is the safety net.
    if (err.code === '23505') throw new HttpError(409, duplicateMessage(clean.slot));
    throw err;
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const existing = (await db.query(
    `SELECT ${COLS} FROM readings WHERE id = $1 AND user_id = $2`, [id, req.user.id]
  )).rows[0];
  if (!existing) throw new HttpError(404, 'Reading not found.');

  const body = req.body || {};
  const clean = validateOrThrow({
    value: body.value ?? existing.value,
    date: body.date ?? existing.reading_date,
    slot: body.slot ?? existing.slot,
  });
  await assertSlotAvailable(req.user.id, clean.date, clean.slot, id);
  try {
    const { rows } = await db.query(
      `UPDATE readings SET reading_date = $1, slot = $2, value = $3, updated_at = NOW()
        WHERE id = $4 AND user_id = $5 RETURNING ${COLS}`,
      [clean.date, clean.slot, clean.value, id, req.user.id]
    );
    res.json(toDto(rows[0]));
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, duplicateMessage(clean.slot));
    throw err;
  }
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await db.query('DELETE FROM readings WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Reading not found.');
  res.status(204).end();
}));

module.exports = router;
