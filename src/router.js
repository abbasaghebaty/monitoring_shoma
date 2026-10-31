import { sendMessage } from "./telegram.js";
import { getUser, ensureKnownUsers } from "./db/users.js";
import { handleStart, handleHelp } from "./handlers/start.js";
import { handleCheckIn, handleCheckOut, handleStatus } from "./handlers/attendance.js";
import { handleAddUser, handleListUsers, handleReport, handleChart } from "./handlers/admin.js";
import {
  handleProducts, handleProductAdd, handlePurchase, handleSale, handleDebtPayment,
  handleReports, handlePriceUpdate, handleCustomerAdd, handleCustomers, handleShortage,
} from "./handlers/shop.js";

const COMMANDS = [
  { names: ["/start"], run: handleStart, public: true },
  { names: ["/help", "راهنما"], run: handleHelp },
  { names: ["/vorud", "/in", "ورود", "🔵 ورود"], run: handleCheckIn },
  { names: ["/khoruj", "/out", "خروج", "🔴 خروج"], run: handleCheckOut },
  { names: ["/status", "وضعیت"], run: handleStatus },
  { names: ["/users", "کاربران"], run: handleListUsers, owner: true },
  { names: ["/adduser"], run: handleAddUser, owner: true },
  { names: ["/report", "گزارش امروز"], run: (ctx) => handleReport({ ...ctx, days: 1 }), owner: true },
  { names: ["/weekly", "گزارش هفتگی"], run: (ctx) => handleReport({ ...ctx, days: 7 }), owner: true },
  { names: ["/chart", "نمودار"], run: handleChart, owner: true },
  { names: ["/products", "محصولات"], run: handleProducts, admin: true },
  { names: ["/customer_add"], run: handleCustomerAdd, admin: true },
  { names: ["/customers"], run: handleCustomers, admin: true },
  { names: ["/shortage"], run: handleShortage, admin: true },
  { names: ["/product_add"], run: handleProductAdd, admin: true },
  { names: ["/purchase"], run: handlePurchase, admin: true },
  { names: ["/sale"], run: handleSale, admin: true },
  { names: ["/debtpay"], run: handleDebtPayment, admin: true },
  { names: ["/price"], run: handlePriceUpdate, admin: true },
  { names: ["/inventory_report", "گزارش مالی"], run: handleReports, admin: true },
];

function isAdmin(env, telegramId) {
  const configured = String(env.ADMIN_IDS || env.OWNER_ID || "");
  return configured.split(",").map((x) => x.trim()).filter(Boolean).includes(String(telegramId));
}

export async function routeUpdate(update, env) {
  const msg = update.message;
  if (!msg?.text || !msg.from) return;

  await ensureKnownUsers(env, msg.from);
  const rawText = msg.text.trim();
  const fullText = rawText.toLowerCase();
  const [rawHead, ...args] = rawText.split(/\s+/);
  const cmd = rawHead.toLowerCase().split("@")[0];
  const entry = COMMANDS.find((item) => item.names.includes(fullText) || item.names.includes(cmd));
  if (!entry) return;

  const user = await getUser(env, msg.from.id);
  const ctx = { env, msg, args, user, chatId: msg.chat.id };
  if (!user || !user.is_active) {
    return sendMessage(env, ctx.chatId, "⛔ حساب شما در سیستم ثبت نشده یا غیرفعال است.");
  }
  if (entry.admin && !isAdmin(env, msg.from.id)) {
    return sendMessage(env, ctx.chatId, "⛔ دسترسی این بخش فقط برای مدیران مجاز است.");
  }
  if (entry.owner && user.role !== "owner") {
    return sendMessage(env, ctx.chatId, "⛔ این دستور فقط برای مدیر کل فعال است.");
  }
  if (!entry.public && user.role === "owner" && !entry.owner && !entry.admin && !["/help", "راهنما"].includes(cmd)) {
    return sendMessage(env, ctx.chatId, "این قابلیت برای حساب‌های کارمندی است.");
  }
  return entry.run(ctx);
}
