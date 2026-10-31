export function formatTime(iso, tz) {
  return new Intl.DateTimeFormat("fa-IR", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} ساعت و ${m} دقیقه` : `${m} دقیقه`;
}

// شروع امروز (به وقت منطقه) به صورت ISO UTC
export function startOfTodayIso(tz) {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD
  const offsetMs = new Date(now.toLocaleString("en-US", { timeZone: tz })) - new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(new Date(day + "T00:00:00Z").getTime() - offsetMs).toISOString();
}
