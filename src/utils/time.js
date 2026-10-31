export function formatTime(iso, tz = "Asia/Tehran") {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: tz, dateStyle: "short", timeStyle: "short",
  }).format(new Date(iso));
}

export function formatDate(iso = new Date().toISOString(), tz = "Asia/Tehran") {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: tz, dateStyle: "full",
  }).format(new Date(iso));
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} ساعت و ${m} دقیقه` : `${m} دقیقه`;
}

export function formatToman(amount) {
  return `${Math.round(Number(amount) || 0).toLocaleString("fa-IR")} تومان`;
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

function shiftDateKey(dayKey, days) {
  const date = new Date(dayKey + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfLocalMonthIso(now = new Date(), tz = "Asia/Tehran") {
  const persianParts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: tz, day: "numeric",
  }).formatToParts(now);
  const persianDay = Number(persianParts.find((part) => part.type === "day")?.value || 1);
  const todayKey = localDateKey(now.toISOString(), tz);
  const firstDayKey = shiftDateKey(todayKey, -(persianDay - 1));
  return startOfLocalDayIso(firstDayKey, tz);
}

export function daysAgoKey(days, tz = "Asia/Tehran") {
  const today = localDateKey(new Date().toISOString(), tz);
  return shiftDateKey(today, -days);
}
