import { sendMessage } from "./telegram.js";
import { getUser, ensureOwner } from "./db/users.js";
import { handleStart, handleHelp } from "./handlers/start.js";
import { handleCheckIn, handleCheckOut, handleStatus } from "./handlers/attendance.js";
import { handleAddUser, handleListUsers } from "./handlers/admin.js";

// هر کامند: نام انگلیسی + معادل فارسی (متن ساده) + حداقل نقش
const COMMANDS = [
  { names: ["/start"], run: handleStart, public: true },
  { names: ["/help", "راهنما"], run: handleHelp },
  { names: ["/vorud", "/in", "ورود"], run: handleCheckIn },
  { names: ["/khoruj", "/out", "خروج"], run: handleCheckOut },
  { names: ["/status", "وضعیت"], run: handleStatus },
  { names: ["/adduser"], run: handleAddUser, roles: ["owner", "manager"] },
  { names: ["/users"], run: handleListUsers, roles: ["owner", "manager"] },
];

export async function routeUpdate(update, env) {
  const msg = update.message;
  if (!msg || !msg.text) return;

  await ensureOwner(env, msg.from);

  const [head, ...args] = msg.text.trim().split(/\s+/);
  const cmd = head.split("@")[0].toLowerCase();
  const entry = COMMANDS.find((c) => c.names.includes(cmd));
  if (!entry) return;

  const user = await getUser(env, msg.from.id);
  const ctx = { env, msg, args, user, chatId: msg.chat.id };

  if (!entry.public) {
    if (!user || !user.is_active) {
      return sendMessage(env, ctx.chatId, "⛔ شما در سیستم ثبت نشده‌اید. آیدی عددی‌تان را به مدیر بدهید.\nآیدی شما: " + msg.from.id);
    }
    if (entry.roles && !entry.roles.includes(user.role)) {
      return sendMessage(env, ctx.chatId, "⛔ دسترسی ندارید.");
    }
  }
  await entry.run(ctx);
}
