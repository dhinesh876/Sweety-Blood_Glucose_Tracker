const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

function isValidDateString(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Today's calendar date in the server's local timezone, as YYYY-MM-DD.
function todayString(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isFuture(dateStr, now = new Date()) {
  return dateStr > todayString(now); // ISO date strings compare correctly as text
}

const fmt = (dt) => dt.toISOString().slice(0, 10);

function getReportRanges(selected) {
  const [y, m] = selected.split('-').map(Number);
  const prevFirst = new Date(Date.UTC(y, m - 2, 1));
  const prevLast = new Date(Date.UTC(y, m - 1, 0)); // day 0 of this month = last day of previous
  return {
    daily: { from: selected, to: selected },
    monthToDate: { from: `${y}-${pad(m)}-01`, to: selected },
    monthly: { from: fmt(prevFirst), to: fmt(prevLast) },
  };
}

module.exports = { isValidDateString, todayString, isFuture, getReportRanges };
