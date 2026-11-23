const SLOTS = {
  morning: 'Morning (fasting)',
  after_breakfast: 'After breakfast',
  after_lunch: 'After lunch',
  after_dinner: 'After dinner',
};

// Short names used in sentences ("You already have an After lunch reading...")
const SLOT_SHORT = {
  morning: 'Morning',
  after_breakfast: 'After breakfast',
  after_lunch: 'After lunch',
  after_dinner: 'After dinner',
};

const SLOT_KEYS = Object.keys(SLOTS);

const SLOT_ORDER_SQL = `CASE slot
  WHEN 'morning' THEN 1
  WHEN 'after_breakfast' THEN 2
  WHEN 'after_lunch' THEN 3
  WHEN 'after_dinner' THEN 4 END`;

const MIN_VALUE = 40;
const MAX_VALUE = 600;
const MAX_READINGS_PER_DAY = 4;

const MESSAGES = {
  valueRequired: 'Please enter a glucose value.',
  valueRange: `Value must be between ${MIN_VALUE} and ${MAX_VALUE} mg/dl.`,
  dateRequired: 'Please select a date.',
  dateInvalid: 'Please enter a valid date (YYYY-MM-DD).',
  dateFuture: 'Date cannot be in the future.',
  slotInvalid: 'Please choose a time slot.',
  maxPerDay: `You can add only ${MAX_READINGS_PER_DAY} readings per day.`,
};

function duplicateMessage(slot) {
  const name = SLOT_SHORT[slot];
  const article = /^[aeiou]/i.test(name) ? 'an' : 'a';
  return `You already have ${article} ${name} reading for this date.`;
}

module.exports = {
  SLOTS, SLOT_SHORT, SLOT_KEYS, SLOT_ORDER_SQL,
  MIN_VALUE, MAX_VALUE, MAX_READINGS_PER_DAY, MESSAGES, duplicateMessage,
};
