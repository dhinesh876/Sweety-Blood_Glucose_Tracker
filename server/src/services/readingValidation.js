const { SLOT_KEYS, MIN_VALUE, MAX_VALUE, MESSAGES } = require('../constants');
const { isValidDateString, isFuture } = require('../utils/dates');

/**
 * Validates one reading's fields. Returns { errors, clean }.
 * `errors` is keyed by field; `clean` holds normalised values when valid.
 */
function validateReadingInput({ value, date, slot } = {}, now = new Date()) {
  const errors = {};

  // value
  const blank = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  let numeric;
  if (blank) {
    errors.value = MESSAGES.valueRequired;
  } else {
    const isIntString = typeof value === 'string' && /^\d+$/.test(value.trim());
    numeric = typeof value === 'number' ? value : isIntString ? Number(value.trim()) : NaN;
    if (!Number.isInteger(numeric) || numeric < MIN_VALUE || numeric > MAX_VALUE) {
      errors.value = MESSAGES.valueRange;
    }
  }

  // date
  if (date === undefined || date === null || date === '') {
    errors.date = MESSAGES.dateRequired;
  } else if (!isValidDateString(date)) {
    errors.date = MESSAGES.dateInvalid;
  } else if (isFuture(date, now)) {
    errors.date = MESSAGES.dateFuture;
  }

  // slot
  if (!SLOT_KEYS.includes(slot)) errors.slot = MESSAGES.slotInvalid;

  return { errors, clean: { value: numeric, date, slot } };
}

const firstError = (errors) => Object.values(errors)[0];

module.exports = { validateReadingInput, firstError };
