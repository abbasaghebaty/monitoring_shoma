import { sendMessage } from "../telegram.js";
import { getOpenShift, checkIn, checkOut, todayMinutes } from "../db/attendance.js";
import { formatTime, formatDuration, startOfLocalDayIso, localDateKey } from "../utils/time.js";

function employeeOnly(user) {
  return user?.role === "employee";
}

export async function handleCheckIn({ env, chatId, user }) {
  if (!employeeOnly(user)) return sendMessage(env, chatId, "این بخش فقط برای حساب‌های کارمندی فعال است.");
  if (await getOpenShift(env, user.telegram_id)) {
    return sendMessage(env, chatId, "⚠️ ورود قبلاً ثبت شده و هنوز خروج ثبت نکرده‌اید.");
  }
  const at = await checkIn(env, user.telegram_id);
  return sendMessage(env, chatId, `✅ ورود ثبت شد\n🕒 ${formatTime(at, env.TIMEZONE)}`);
}

export async function handleCheckOut({ env, chatId, user }) {
  if (!employeeOnly(user)) return sendMessage(env, chatId, "این بخش فقط برای حساب‌های کارمندی فعال است.");
  const shift = await getOpenShift(env, user.telegram_id);
  if (!shift) return sendMessage(env, chatId, "⚠️ ورود بازی برای ثبت خروج ندارید.");
  const { now, minutes } = await checkOut(env, shift);
  return sendMessage(env, chatId, `✅ خروج ثبت شد\n🕒 ${formatTime(now, env.TIMEZONE)}\n⏱ مدت این شیفت: ${formatDuration(minutes)}`);
}

export async function handleStatus({ env, chatId, user }) {
  if (!employeeOnly(user)) return sendMessage(env, chatId, "وضعیت حضور فقط برای حساب‌های کارمندی است.");
  const shift = await getOpenShift(env, user.telegram_id);
  const done = await todayMinutes(env, user.telegram_id, startOfLocalDayIso(localDateKey(new Date().toISOString(), env.TIMEZONE), env.TIMEZONE));
  const state = shift ? `🟢 ورود ثبت‌شده: ${formatTime(shift.check_in, env.TIMEZONE)}` : "🔴 در حال حاضر شیفت بازی ندارید.";
  return sendMessage(env, chatId, `${state}\nمجموع ساعت ثبت‌شده امروز: ${formatDuration(done)}`);
}
