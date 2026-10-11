/**
 * Självsläckning av kalendernotiser. Cognito-läget rörs inte;
 * utgångna event utelämnas bara från notification-status-svaret.
 *
 * Tider är väggklocka i Europe/Stockholm.
 * - REHEARSAL: öppen till och med söndag 23:59:59 i repetitionens vecka
 *   (måndag–söndag). Stängd från måndag 00:00:00 veckan efter.
 * - CONCERT: öppen under gigets kalenderdygn. Stängd från 00:00:00
 *   dagen efter det senare av eventDate och endDate.
 */

const STOCKHOLM = "Europe/Stockholm";

type Ymd = { year: number; month: number; day: number };

export type NotificationWindowEvent = {
  eventType?: unknown;
  eventDate?: unknown;
  endDate?: unknown;
};

export function isNotificationWindowClosed(
  event: NotificationWindowEvent,
  now: Date = new Date()
): boolean {
  if (Number.isNaN(now.getTime())) return false;

  if (event.eventType === "REHEARSAL") {
    const anchor = stockholmYmd(parseInstant(event.eventDate));
    if (!anchor) return false;
    return now.getTime() >= rehearsalClosesAt(anchor).getTime();
  }

  if (event.eventType === "CONCERT") {
    const anchor = laterStockholmDate(event.eventDate, event.endDate);
    if (!anchor) return false;
    return now.getTime() >= concertClosesAt(anchor).getTime();
  }

  return false;
}

/** Måndag 00:00:00 Stockholm i veckan efter repetitionens kalenderdatum. */
export function rehearsalClosesAt(eventDay: Ymd): Date {
  const weekday = weekdayOf(eventDay);
  const daysUntilFollowingMonday = weekday === 0 ? 1 : 8 - weekday;
  return stockholmMidnightUtc(addDays(eventDay, daysUntilFollowingMonday));
}

/** 00:00:00 Stockholm dagen efter gigets kalenderdatum. */
export function concertClosesAt(eventDay: Ymd): Date {
  return stockholmMidnightUtc(addDays(eventDay, 1));
}

/** UTC-instant för 00:00:00 på ett kalenderdatum i Europe/Stockholm. */
export function stockholmMidnightUtc(ymd: Ymd): Date {
  const guess = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0);
  const offset1 = stockholmOffsetMs(new Date(guess));
  const corrected = new Date(guess - offset1);
  const offset2 = stockholmOffsetMs(corrected);
  if (offset1 === offset2) return corrected;
  return new Date(guess - offset2);
}

function laterStockholmDate(eventDate: unknown, endDate: unknown): Ymd | null {
  const start = stockholmYmd(parseInstant(eventDate));
  const end = stockholmYmd(parseInstant(endDate));
  if (start && end) return compareYmd(start, end) >= 0 ? start : end;
  return start ?? end;
}

function parseInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function stockholmYmd(instant: Date | null): Ymd | null {
  if (!instant) return null;
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: STOCKHOLM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(formatted);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** 0 = söndag … 6 = lördag, för kalenderdatumet (oberoende av tidszon). */
function weekdayOf(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

function addDays(ymd: Ymd, days: number): Ymd {
  const shifted = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function compareYmd(a: Ymd, b: Ymd): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** Millisekunder som Stockholm ligger före UTC vid instant. */
function stockholmOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STOCKHOLM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  let year = pick("year");
  let month = pick("month");
  let day = pick("day");
  let hour = pick("hour");
  const minute = pick("minute");
  const second = pick("second");

  // Vissa motorer skriver midnatt som 24:00 på föregående dygn.
  if (hour === 24) {
    hour = 0;
    const next = addDays({ year, month, day }, 1);
    year = next.year;
    month = next.month;
    day = next.day;
  }

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return wallAsUtc - instant.getTime();
}
