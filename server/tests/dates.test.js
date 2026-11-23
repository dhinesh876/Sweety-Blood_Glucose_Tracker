const { isValidDateString, isFuture, getReportRanges, todayString } = require('../src/utils/dates');

describe('isValidDateString', () => {
  test.each(['2026-10-15', '2024-02-29'])('accepts %s', (d) => expect(isValidDateString(d)).toBe(true));
  test.each(['2026-02-30', '2026-13-01', '15-10-2026', '', null, undefined, '2026-1-5'])(
    'rejects %s', (d) => expect(isValidDateString(d)).toBe(false)
  );
});

describe('isFuture', () => {
  const now = new Date(2026, 9, 15, 12, 0, 0); // 15 Oct 2026 local
  test('today is not future', () => expect(isFuture('2026-10-15', now)).toBe(false));
  test('past is not future', () => expect(isFuture('2026-10-14', now)).toBe(false));
  test('tomorrow is future', () => expect(isFuture('2026-10-16', now)).toBe(true));
  test('todayString formats local date', () => expect(todayString(now)).toBe('2026-10-15'));
});

describe('getReportRanges', () => {
  test('matches the assignment example (15 Oct 2026)', () => {
    expect(getReportRanges('2026-10-15')).toEqual({
      daily: { from: '2026-10-15', to: '2026-10-15' },
      monthToDate: { from: '2026-10-01', to: '2026-10-15' },
      monthly: { from: '2026-09-01', to: '2026-09-30' },
    });
  });
  test('January rolls back to December of the previous year', () => {
    expect(getReportRanges('2026-01-10').monthly).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  test('March handles short February', () => {
    expect(getReportRanges('2026-03-05').monthly).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(getReportRanges('2028-03-05').monthly).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
