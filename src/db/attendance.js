export async function getOpenShift(env, telegramId) {
  return env.DB.prepare(
    "SELECT * FROM attendance WHERE telegram_id = ? AND check_out IS NULL ORDER BY id DESC LIMIT 1"
  ).bind(telegramId).first();
}

export async function checkIn(env, telegramId) {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO attendance (telegram_id, check_in) VALUES (?, ?)").bind(telegramId, now).run();
  return now;
}

export async function checkOut(env, shift) {
  const now = new Date();
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(shift.check_in).getTime()) / 60000));
  await env.DB.prepare("UPDATE attendance SET check_out = ?, duration_minutes = ? WHERE id = ? AND check_out IS NULL")
    .bind(now.toISOString(), minutes, shift.id).run();
  return { now: now.toISOString(), minutes };
}

export async function getAttendanceSince(env, sinceIso) {
  const { results } = await env.DB.prepare(
    `SELECT a.telegram_id, a.check_in, a.check_out, a.duration_minutes, u.full_name
     FROM attendance a JOIN users u ON u.telegram_id = a.telegram_id
     WHERE a.check_in >= ? ORDER BY a.check_in ASC`
  ).bind(sinceIso).all();
  return results || [];
}

export async function todayMinutes(env, telegramId, sinceIso) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(duration_minutes),0) AS m FROM attendance WHERE telegram_id = ? AND check_in >= ? AND check_out IS NOT NULL"
  ).bind(telegramId, sinceIso).first();
  return Number(row?.m || 0);
}

export async function workedMinutesSince(env, telegramId, sinceIso) {
  const { results } = await env.DB.prepare(
    "SELECT check_in, check_out, duration_minutes FROM attendance WHERE telegram_id = ? AND (check_in >= ? OR check_out IS NULL)"
  ).bind(telegramId, sinceIso).all();
  const boundary = new Date(sinceIso).getTime();
  const now = Date.now();
  return (results || []).reduce((sum, row) => {
    if (row.duration_minutes != null) return sum + Math.max(0, Number(row.duration_minutes));
    if (!row.check_out) {
      const start = Math.max(boundary, new Date(row.check_in).getTime());
      return sum + Math.max(0, Math.round((now - start) / 60000));
    }
    return sum;
  }, 0);
}
