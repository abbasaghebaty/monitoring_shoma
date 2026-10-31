import { sendMessage, EMPLOYEE_KEYBOARD, OWNER_KEYBOARD } from "../telegram.js";
export async function handleStart({ env, chatId, user }) {
  if (!user) return sendMessage(env, chatId, "حساب شما در سیستم تعریف نشده است.");
  const owner = user.role === "owner";
  const text = owner
    ? `سلام ${user.full_name}؛ مدیر کل سیستم هستید.\nاز منوی مدیریت برای حضور و غیاب و گزارش‌ها استفاده کنید.\nبرای فروش و انبار، دکمه «فروش و انبار» را بزنید.`
    : `سلام ${user.full_name}؛ حساب شما کارمند است.\nبرای ثبت ساعت کاری از دکمه‌های ورود و خروج و برای ثبت فروش از «فروش و انبار» استفاده کنید.`;
  return sendMessage(env, chatId, text, owner ? OWNER_KEYBOARD : EMPLOYEE_KEYBOARD);
}
export async function handleHelp({ env, chatId, user }) {
  if (user?.role === "owner") return sendMessage(env, chatId,
    "منوی اصلی: گزارش امروز، گزارش هفتگی، کاربران و نمودار.\nبرای عملیات فروش و انبار از دکمه «فروش و انبار» یا دستور /shop استفاده کن.\nدستورات متنی قدیمی فروش همچنان به‌عنوان میانبر باقی مانده‌اند.");
  return sendMessage(env, chatId, "ورود، خروج، وضعیت و ثبت فروش از منوی دکمه‌ای در دسترس هستند.\nبرای فروش /shop را بزن.");
}
