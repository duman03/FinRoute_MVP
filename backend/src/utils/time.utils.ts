const UTC_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function assertValidUtcDate(dateValue: string): void {
  if (!UTC_DATE_REGEX.test(dateValue)) {
    throw new Error('INVALID_UTC_DATE');
  }

  const parsedDate = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('INVALID_UTC_DATE');
  }
}

export function getServerUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextUtcMidnightUnix(): number {
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ));

  return Math.floor(nextMidnight.getTime() / 1000);
}

export function getUtcDateFromIso(iso: string): string {
  const parsedDate = new Date(iso);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('INVALID_EVENT_TIME');
  }

  return parsedDate.toISOString().slice(0, 10);
}

export function getWeekMondayUtc(utcDate: string): string {
  assertValidUtcDate(utcDate);

  const date = new Date(`${utcDate}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;

  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function calcDaysDiff(lastDateStr: string, todayStr: string): number {
  assertValidUtcDate(lastDateStr);
  assertValidUtcDate(todayStr);

  const lastDate = new Date(`${lastDateStr}T00:00:00.000Z`);
  const today = new Date(`${todayStr}T00:00:00.000Z`);
  const diffDays = Math.floor((today.getTime() - lastDate.getTime()) / 86_400_000);

  return Math.max(diffDays, 0);
}
