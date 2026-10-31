export function formatTime(iso, tz = "Asia/Tehran") {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: tz, dateStyle: "short", timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} ساعت و ${m} دقیقه` : `${m} دقیقه`;
}

export function localDateKey(iso, tz = "Asia/Tehran") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function offsetAt(utcDate, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(utcDate);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) - utcDate.getTime();
}

export function startOfLocalDayIso(dayKey, tz = "Asia/Tehran") {
  const guess = new Date(dayKey + "T00:00:00.000Z");
  return new Date(guess.getTime() - offsetAt(guess, tz)).toISOString();
}

export function daysAgoKey(days, tz = "Asia/Tehran") {
  const today = localDateKey(new Date().toISOString(), tz);
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
