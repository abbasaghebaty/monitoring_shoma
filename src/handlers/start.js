import { sendMessage, EMPLOYEE_KEYBOARD, OWNER_KEYBOARD } from "../telegram.js";

export async function handleStart({ env, chatId, user }) {
  if (!user) return sendMessage(env, chatId, "حساب شما در سیستم تعریف نشده است.");
  const isOwner = user.role === "owner";
  const text = isOwner
    ? `سلام ${user.full_name}؛ مدیر کل سیستم هستید.
از منوی مدیریت برای حضور و غیاب و گزارش‌ها استفاده کنید.
برای انبار و فروش از /help و دستورات مالی استفاده کنید.`
    : `سلام ${user.full_name}؛ حساب شما کارمند است.
برای ثبت ساعت کاری از دکمه‌های ورود و خروج استفاده کنید.`;
  return sendMessage(env, chatId, text, isOwner ? OWNER_KEYBOARD : EMPLOYEE_KEYBOARD);
}

export async function handleHelp({ env, chatId, user }) {
  if (user?.role === "owner") {
    return sendMessage(env, chatId,
      "دستورات مدیریت حضور و غیاب:\nگزارش امروز\nگزارش هفتگی\nنمودار\nکاربران\n/adduser <آیدی> <نام>\n\nدستورات انبار و فروش (فقط ADMIN_IDS):\n/products\n/customers\n/customer_add نام | تلفن | توضیح\n/shortage شناسه | customer_request یا sold_out | توضیح\n/product_add نام | خرید | فروش | مصرف‌کننده\n/purchase تأمین‌کننده | شناسه:تعداد:خرید:فروش:مصرف;... | توضیح\n/sale شناسه‌مشتری یا - | cash:مبلغ;card:مبلغ | شناسه:تعداد:قیمت;... | توضیح\n/debtpay شناسه‌بدهی | cash/card/transfer | مبلغ | توضیح\n/price شناسه | فروش | مصرف‌کننده\n/inventory_report");
  }
  return sendMessage(env, chatId, "دستورات کارمندی:\nورود (/vorud)\nخروج (/khoruj)\nوضعیت (/status)");
}
