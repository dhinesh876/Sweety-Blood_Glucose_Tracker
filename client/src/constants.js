export const SLOTS = [
  { value: 'morning', label: 'Morning (fasting)', short: 'Morning' },
  { value: 'after_breakfast', label: 'After breakfast', short: 'Breakfast' },
  { value: 'after_lunch', label: 'After lunch', short: 'Lunch' },
  { value: 'after_dinner', label: 'After dinner', short: 'Dinner' },
];

export const MIN_VALUE = 40;
export const MAX_VALUE = 600;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatRange(from, to) {
  if (from === to) return formatDate(from);
  const [y, m, d] = from.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} – ${formatDate(to)}`;
}
