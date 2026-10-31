const KNOWN_USERS = [
  { telegramId: 7548075013, fullName: "عباس", role: "employee" },
  { telegramId: 8842657623, fullName: "صادق", role: "employee" },
  { telegramId: 8241627626, fullName: "پدر", role: "employee" },
  { telegramId: 7256726586, fullName: "پدر", role: "employee" },
  { telegramId: 602217153, fullName: "مادر", role: "owner" },
];

export async function getUser(env, telegramId) {
  return env.DB.prepare("SELECT * FROM users WHERE telegram_id = ?").bind(telegramId).first();
}

export async function listUsers(env) {
  const { results } = await env.DB.prepare(
    "SELECT telegram_id, full_name, role, is_active, created_at FROM users ORDER BY full_name, telegram_id"
  ).all();
  return results || [];
}

export async function upsertUser(env, { telegramId, fullName, username = null, role = "employee" }) {
  await env.DB.prepare(
    `INSERT INTO users (telegram_id, full_name, username, role, is_active)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(telegram_id) DO UPDATE SET
       full_name = excluded.full_name,
       username = COALESCE(excluded.username, users.username),
       role = excluded.role,
       is_active = 1`
  ).bind(telegramId, fullName, username, role).run();
}

// ثبت اولیه حساب‌های شناخته‌شده؛ مادر تنها owner است.
export async function ensureKnownUsers(env, from) {
  for (const person of KNOWN_USERS) {
    await upsertUser(env, {
      ...person,
      username: Number(person.telegramId) === Number(from.id) ? (from.username ?? null) : null,
    });
  }
}
