import { sendMessage } from "../telegram.js";
import { getOpenShift, checkIn, checkOut, todayMinutes, workedMinutesSince } from "../db/attendance.js";
import { formatTime, formatDuration, formatToman, formatDate, startOfLocalDayIso, startOfLocalMonthIso, localDateKey } from "../utils/time.js";

const HOURLY_RATE_TOMAN = 16000;

function employeeOnly(user) {
  return user?.role === "employee";
}

export async function handleCheckIn({ env, chatId, user }) {
  if (!employeeOnly(user)) return sendMessage(env, chatId, "این بخش فقط برای حساب‌های کارمندی فعال است.");
  if (await getOpenShift(env, user.telegram_id)) {
    return sendMessage(env, chatId, "⚠️ ورود قبلاً ثبت شده و هنوز خروج ثبت نکرده‌اید.");
  }
  const at = await checkIn(env, user.telegram_id);
  return sendMessage(env, chatId, `🔵 ورود ثبت شد\n🕒 ${formatTime(at, env.TIMEZONE)}`);
}

export async function handleCheckOut({ env, chatId, user }) {
  if (!employeeOnly(user)) return sendMessage(env, chatId, "این بخش فقط برای حساب‌های کارمندی فعال است.");
  const shift = await getOpenShift(env, user.telegram_id);
  if (!shift) return sendMessage(env, chatId, "⚠️ ورود بازی برای ثبت خروج ندارید.");
  const { now, minutes } = await checkOut(env, shift);
  return sendMessage(env, chatId, `🔴 خروج ثبت شد\n🕒 ${formatTime(now, env.TIMEZONE)}\n⏱ مدت این شیفت: ${formatDuration(minutes)}`);
}

export async function handleStatus({ env, chatId, user }) {
  if (!employeeOnly(user)) return sendMessage(env, chatId, "وضعیت حضور فقط برای حساب‌های کارمندی است.");
  const tz = env.TIMEZONE || "Asia/Tehran";
  const now = new Date();
  const todayStart = startOfLocalDayIso(localDateKey(now.toISOString(), tz), tz);
  const monthStart = startOfLocalMonthIso(now, tz);
  const shift = await getOpenShift(env, user.telegram_id);
  const done = await todayMinutes(env, user.telegram_id, todayStart);
  const todayWorked = await workedMinutesSince(env, user.telegram_id, todayStart);
  const monthWorked = await workedMinutesSince(env, user.telegram_id, monthStart);
  const state = shift ? `🟢 ورود ثبت‌شده: ${formatTime(shift.check_in, tz)}` : "🔴 در حال حاضر شیفت بازی ندارید.";
  const todayIncome = todayWorked * HOURLY_RATE_TOMAN / 60;
  const monthIncome = monthWorked * HOURLY_RATE_TOMAN / 60;
  return sendMessage(env, chatId,
    `📅 ${formatDate(now.toISOString(), tz)}\n\n${state}\nمجموع ساعت ثبت‌شده امروز: ${formatDuration(Math.max(done, todayWorked))}\n\n📊 مانیتورینگ درآمد\n💰 درآمد امروز: ${formatToman(todayIncome)}\n💰 درآمد این ماه: ${formatToman(monthIncome)}\n⏱ مجموع ساعت کارکرد این ماه: ${formatDuration(monthWorked)}`
  );
}
