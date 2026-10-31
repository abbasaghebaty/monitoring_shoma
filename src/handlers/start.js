import { sendMessage, EMPLOYEE_KEYBOARD, OWNER_KEYBOARD } from "../telegram.js";

export async function handleStart({ env, chatId, user }) {
  if (!user) return sendMessage(env, chatId, "حساب شما در سیستم تعریف نشده است.");
  const isOwner = user.role === "owner";
  const text = isOwner
    ? `سلام ${user.full_name}؛ مدیر کل سیستم هستید.\nاز منوی مدیریت برای مشاهده گزارش‌ها و نمودارها استفاده کنید.`
    : `سلام ${user.full_name}؛ حساب شما کارمند است.\nبرای ثبت ساعت کاری از دکمه‌های ورود و خروج استفاده کنید.`;
  return sendMessage(env, chatId, text, isOwner ? OWNER_KEYBOARD : EMPLOYEE_KEYBOARD);
}

export async function handleHelp({ env, chatId, user }) {
  if (user?.role === "owner") {
    return sendMessage(env, chatId,
      "دستورات مدیریت:\nگزارش امروز\nگزارش هفتگی\nنمودار\nکاربران\n/report\n/weekly\n/chart\n/users\n/adduser <آیدی> <نام>");
  }
  return sendMessage(env, chatId, "دستورات کارمندی:\nورود (/vorud)\nخروج (/khoruj)\nوضعیت (/status)");
}
