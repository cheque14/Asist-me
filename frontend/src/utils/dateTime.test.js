import { dateInTimeZone, localDateTimeToIso, localIsoToDateTimeInputs, clinicDateTimeInputs, formatClinicTime } from './dateTime';

test('proposal inputs and display use clinic time independent of device zone', () => {
  expect(clinicDateTimeInputs('2026-10-30T21:00:00Z', 'America/Mexico_City')).toEqual({ date: '2026-10-30', time: '15:00' });
  expect(formatClinicTime('2026-10-30T21:00:00Z', 'America/Mexico_City')).toBe('15:00');
});

test('calendar minimum date follows the clinic, not the UTC day', () => {
  expect(dateInTimeZone(new Date('2026-10-30T02:00:00Z'), 'America/Mexico_City')).toBe('2026-10-29');
  expect(dateInTimeZone(new Date('2026-10-30T02:00:00Z'), 'Asia/Tokyo')).toBe('2026-10-30');
});

test('missing or invalid clinic zones never silently select the device zone', () => {
  expect(dateInTimeZone(new Date('2026-10-30T02:00:00Z'), undefined)).toBe('');
  expect(dateInTimeZone(new Date('2026-10-30T02:00:00Z'), 'Invalid/Zone')).toBe('');
});

test('existing local conversion helpers retain their behavior', () => {
  const expected = new Date(2099, 9, 30, 15, 0);
  expect(localDateTimeToIso('2099-10-30', '15:00')).toBe(expected.toISOString());
  expect(localIsoToDateTimeInputs(expected.toISOString())).toEqual({ date: '2099-10-30', time: '15:00' });
});
