const db = require('../db');
const { SLOTS, SLOT_ORDER_SQL } = require('../constants');
const { getReportRanges } = require('../utils/dates');

async function getStats(userId, { from, to }) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count,
            MAX(value)    AS highest,
            MIN(value)    AS lowest,
            ROUND(AVG(value)::numeric, 1) AS average
       FROM readings
      WHERE user_id = $1 AND reading_date BETWEEN $2 AND $3`,
    [userId, from, to]
  );
  const r = rows[0];
  if (r.count === 0) {
    return { count: 0, highest: null, lowest: null, average: null, empty: true };
  }
  return { count: r.count, highest: r.highest, lowest: r.lowest, average: Number(r.average), empty: false };
}

async function buildReport(userId, date) {
  const ranges = getReportRanges(date);
  const [daily, monthToDate, monthly, dailyRows] = await Promise.all([
    getStats(userId, ranges.daily),
    getStats(userId, ranges.monthToDate),
    getStats(userId, ranges.monthly),
    db.query(
      `SELECT id, slot, value FROM readings
        WHERE user_id = $1 AND reading_date = $2
        ORDER BY ${SLOT_ORDER_SQL}`,
      [userId, date]
    ),
  ]);

  return {
    date,
    daily: {
      range: ranges.daily,
      ...daily,
      readings: dailyRows.rows.map((r) => ({ id: r.id, slot: r.slot, slotLabel: SLOTS[r.slot], value: r.value })),
    },
    monthToDate: { range: ranges.monthToDate, ...monthToDate },
    monthly: { range: ranges.monthly, ...monthly },
  };
}

module.exports = { getStats, buildReport };
