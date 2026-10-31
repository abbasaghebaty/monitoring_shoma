import { sendMessage, MAIN_KEYBOARD } from "../telegram.js";

export async function handleStart({ env, chatId, msg, user }) {
  if (!user) {
    return sendMessage(env, chatId, `سلام 👋\nشما هنوز در سیستم ثبت نشده‌اید.\nآیدی عددی شما: ${msg.from.id}\nاین عدد را به مدیر بدهید.`);
  }
  return sendMessage(env, chatId, `سلام ${user.full_name} 👋\nنقش شما: ${user.role}`, MAIN_KEYBOARD);
}

export async function handleHelp({ env, chatId, user }) {
  let t = "📋 دستورات:\nورود (/vorud)\nخروج (/khoruj)\nوضعیت (/status)";
  if (user && ["owner", "manager"].includes(user.role)) {
    t += "\n\n👑 مدیریت:\n/adduser <آیدی عددی> <manager|employee> <نام>\n/users";
  }
  return sendMessage(env, chatId, t);
}
