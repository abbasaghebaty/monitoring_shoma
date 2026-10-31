import { sendMessage } from "../telegram.js";
import { upsertUser, listUsers } from "../db/users.js";

export async function handleAddUser({ env, chatId, args, user }) {
  const [id, role, ...nameParts] = args;
  const fullName = nameParts.join(" ");
  if (!/^\d+$/.test(id || "") || !["manager", "employee"].includes(role) || !fullName) {
    return sendMessage(env, chatId, "فرمت: /adduser <آیدی عددی> <manager|employee> <نام>");
  }
  if (role === "manager" && user.role !== "owner") {
    return sendMessage(env, chatId, "⛔ فقط مالک می‌تواند مدیر اضافه کند.");
  }
  await upsertUser(env, { telegramId: Number(id), fullName, role });
  return sendMessage(env, chatId, `✅ ${fullName} با نقش ${role} ثبت شد.`);
}

export async function handleListUsers({ env, chatId }) {
  const users = await listUsers(env);
  const lines = users.map((u) => `${u.is_active ? "🟢" : "⚪"} ${u.full_name} — ${u.role} — ${u.telegram_id}`);
  return sendMessage(env, chatId, lines.join("\n") || "کاربری نیست.");
}
