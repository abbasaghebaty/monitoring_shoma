export async function getUser(env, telegramId) {
  return env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegramId).first();
}

export async function listUsers(env) {
  const { results } = await env.DB.prepare("SELECT * FROM users ORDER BY role, full_name").all();
  return results;
}

export async function upsertUser(env, { telegramId, fullName, username = null, role = "employee" }) {
  await env.DB.prepare(
    `INSERT INTO users (telegram_id, full_name, username, role) VALUES (?, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET full_name = excluded.full_name, role = excluded.role, is_active = 1`
  ).bind(telegramId, fullName, username, role).run();
}

// مالک (OWNER_ID در wrangler.toml) خودکار ثبت می‌شود
export async function ensureOwner(env, from) {
  if (String(from.id) !== String(env.OWNER_ID)) return;
  const existing = await getUser(env, from.id);
  if (existing) return;
  await upsertUser(env, {
    telegramId: from.id,
    fullName: [from.first_name, from.last_name].filter(Boolean).join(" ") || "Owner",
    username: from.username ?? null,
    role: "owner",
  });
}
