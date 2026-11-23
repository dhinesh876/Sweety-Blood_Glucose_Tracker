import { MAX_VALUE, MIN_VALUE, todayLocal } from './constants';

// Mirrors the server rules so users get instant feedback; the server remains the source of truth.
export function validateReading({ value, date, slot }) {
  const errors = {};

  if (value === '' || value === null || value === undefined) {
    errors.value = 'Please enter a glucose value.';
  } else {
    const n = Number(value);
    if (!Number.isInteger(n) || n < MIN_VALUE || n > MAX_VALUE) {
      errors.value = `Value must be between ${MIN_VALUE} and ${MAX_VALUE} mg/dl.`;
    }
  }

  if (!date) errors.date = 'Please select a date.';
  else if (date > todayLocal()) errors.date = 'Date cannot be in the future.';

  if (!slot) errors.slot = 'Please choose a time slot.';
  return errors;
}


export const PASSWORD_MSG = 'Password must be at least 8 characters and include a letter and a number.';

export function validatePassword(pw) {
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return PASSWORD_MSG;
  if (pw.length > 72) return 'Password must be at most 72 characters.';
  return '';
}
