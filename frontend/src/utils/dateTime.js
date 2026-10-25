export function localDateTimeToIso(dateValue, timeValue) {
  if (!dateValue || !timeValue) throw new Error('Selecciona fecha y hora.');
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(localDate.getTime())) throw new Error('La fecha u hora no es válida.');
  return localDate.toISOString();
}

export function localIsoToDateTimeInputs(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: '', time: '' };
  const pad = (part) => String(part).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function dateInTimeZone(value, timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return '';
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  } catch {
    // An invalid clinic configuration must not crash the form or use a device-zone fallback.
    return '';
  }
}

export function validClinicZone(zone) {
  if (!zone) return null;
  try { new Intl.DateTimeFormat('es-MX', { timeZone: zone }).format(); return zone; }
  catch { return null; }
}

export function clinicDateTimeInputs(value, zone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !validClinicZone(zone)) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return { date: dateInTimeZone(date, zone), time: `${fields.hour}:${fields.minute}` };
}

export function formatClinicTime(value, zone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: validClinicZone(zone) || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

export function formatClinicDate(value, zone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: validClinicZone(zone) || 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}
