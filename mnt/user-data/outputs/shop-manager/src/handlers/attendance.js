import { sendMessage } from "../telegram.js";
import { getOpenShift, checkIn, checkOut, todayMinutes } from "../db/attendance.js";
import { formatTime, formatDuration, startOfTodayIso } from "../utils/time.js";

export async function handleCheckIn({ env, chatId, user }) {
  if (await getOpenShift(env, user.telegram_id)) {
    return sendMessage(env, chatId, "⚠️ قبلاً ورود زده‌اید و هنوز خروج نزده‌اید.");
  }
  const at = await checkIn(env, user.telegram_id);
  return sendMessage(env, chatId, `✅ ورود ثبت شد\n🕒 ${formatTime(at, env.TIMEZONE)}`);
}

export async function handleCheckOut({ env, chatId, user }) {
  const shift = await getOpenShift(env, user.telegram_id);
  if (!shift) return sendMessage(env, chatId, "⚠️ ورودی ثبت نشده که خروج بزنید.");
  const { now, minutes } = await checkOut(env, shift);
  return sendMessage(env, chatId, `👋 خروج ثبت شد\n🕒 ${formatTime(now, env.TIMEZONE)}\n⏱ مدت این شیفت: ${formatDuration(minutes)}`);
}

export async function handleStatus({ env, chatId, user }) {
  const shift = await getOpenShift(env, user.telegram_id);
  const done = await todayMinutes(env, user.telegram_id, startOfTodayIso(env.TIMEZONE));
  const state = shift ? `🟢 داخل مغازه از ${formatTime(shift.check_in, env.TIMEZONE)}` : "🔴 خارج از مغازه";
  return sendMessage(env, chatId, `${state}\n📊 مجموع امروز (شیفت‌های بسته): ${formatDuration(done)}`);
}
