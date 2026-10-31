import { sendMessage } from "./telegram.js";
import { getUser, ensureKnownUsers } from "./db/users.js";
import { handleStart, handleHelp } from "./handlers/start.js";
import { handleCheckIn, handleCheckOut, handleStatus } from "./handlers/attendance.js";
import { handleAddUser, handleListUsers, handleReport, handleChart } from "./handlers/admin.js";

const COMMANDS = [
  { names: ["/start"], run: handleStart, public: true },
  { names: ["/help", "راهنما"], run: handleHelp },
  { names: ["/vorud", "/in", "ورود"], run: handleCheckIn },
  { names: ["/khoruj", "/out", "خروج"], run: handleCheckOut },
  { names: ["/status", "وضعیت"], run: handleStatus },
  { names: ["/users", "کاربران"], run: handleListUsers, owner: true },
  { names: ["/adduser"], run: handleAddUser, owner: true },
  { names: ["/report", "گزارش امروز"], run: (ctx) => handleReport({ ...ctx, days: 1 }), owner: true },
  { names: ["/weekly", "گزارش هفتگی"], run: (ctx) => handleReport({ ...ctx, days: 7 }), owner: true },
  { names: ["/chart", "نمودار"], run: handleChart, owner: true },
];

export async function routeUpdate(update, env) {
  const msg = update.message;
  if (!msg?.text || !msg.from) return;

  await ensureKnownUsers(env, msg.from);
  const fullText = msg.text.trim().toLowerCase();
  const [head, ...args] = fullText.split(/\s+/);
  const cmd = head.split("@")[0];
  const entry = COMMANDS.find((item) => item.names.includes(fullText) || item.names.includes(cmd));
  if (!entry) return;

  const user = await getUser(env, msg.from.id);
  const ctx = { env, msg, args, user, chatId: msg.chat.id };
  if (!user || !user.is_active) {
    return sendMessage(env, ctx.chatId, "⛔ حساب شما در سیستم ثبت نشده یا غیرفعال است.");
  }
  if (entry.owner && user.role !== "owner") {
    return sendMessage(env, ctx.chatId, "⛔ این دستور فقط برای مدیر کل فعال است.");
  }
  if (!entry.public && user.role === "owner" && !entry.owner && !["/help", "راهنما"].includes(cmd)) {
    return sendMessage(env, ctx.chatId, "این قابلیت برای حساب‌های کارمندی است.");
  }
  return entry.run(ctx);
}
