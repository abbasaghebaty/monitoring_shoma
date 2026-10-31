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
  const minutes = Math.max(0, Math.round((now - new Date(shift.check_in)) / 60000));
  await env.DB.prepare("UPDATE attendance SET check_out = ?, duration_minutes = ? WHERE id = ?")
    .bind(now.toISOString(), minutes, shift.id).run();
  return { now: now.toISOString(), minutes };
}

export async function todayMinutes(env, telegramId, sinceIso) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(duration_minutes),0) AS m FROM attendance WHERE telegram_id = ? AND check_in >= ? AND check_out IS NOT NULL"
  ).bind(telegramId, sinceIso).first();
  return row.m;
}
