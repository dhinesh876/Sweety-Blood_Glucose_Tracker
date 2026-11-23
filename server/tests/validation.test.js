const { validateReadingInput } = require('../src/services/readingValidation');
const { duplicateMessage } = require('../src/constants');

const now = new Date(2026, 9, 15, 12);
const ok = { value: 120, date: '2026-10-15', slot: 'morning' };

describe('validateReadingInput', () => {
  test('accepts a valid reading', () => {
    const { errors, clean } = validateReadingInput(ok, now);
    expect(errors).toEqual({});
    expect(clean).toEqual(ok);
  });

  test.each([undefined, null, ''])('value %p is required', (value) => {
    expect(validateReadingInput({ ...ok, value }, now).errors.value).toBe('Please enter a glucose value.');
  });

  test.each([39, 601, 0, -5, 100.5, 'abc', '12.5', NaN])('value %p is out of range / not whole', (value) => {
    expect(validateReadingInput({ ...ok, value }, now).errors.value).toBe('Value must be between 40 and 600 mg/dl.');
  });

  test.each([40, 600, '120'])('value %p is accepted', (value) => {
    expect(validateReadingInput({ ...ok, value }, now).errors.value).toBeUndefined();
  });

  test('future date rejected', () => {
    expect(validateReadingInput({ ...ok, date: '2026-10-16' }, now).errors.date).toBe('Date cannot be in the future.');
  });

  test('bad / missing date rejected', () => {
    expect(validateReadingInput({ ...ok, date: 'nope' }, now).errors.date).toMatch(/valid date/);
    expect(validateReadingInput({ ...ok, date: '' }, now).errors.date).toBe('Please select a date.');
  });

  test('unknown slot rejected', () => {
    expect(validateReadingInput({ ...ok, slot: 'midnight' }, now).errors.slot).toBe('Please choose a time slot.');
  });
});

describe('duplicateMessage', () => {
  test('matches the assignment wording', () => {
    expect(duplicateMessage('after_lunch')).toBe('You already have an After lunch reading for this date.');
    expect(duplicateMessage('morning')).toBe('You already have a Morning reading for this date.');
  });
});
