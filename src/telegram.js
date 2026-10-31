export async function sendMessage(env, chatId, text, extra = {}) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
  if (!response.ok) console.error("Telegram sendMessage failed:", await response.text());
}
export async function answerCallback(env, callbackQueryId) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
  if (!response.ok) console.error("Telegram answerCallbackQuery failed:", await response.text());
}
export const EMPLOYEE_KEYBOARD = {
  reply_markup: { keyboard: [[{ text: "ورود" }, { text: "خروج" }], [{ text: "وضعیت" }, { text: "🧾 فروش و انبار" }]], resize_keyboard: true },
};
export const OWNER_KEYBOARD = {
  reply_markup: { keyboard: [[{ text: "گزارش امروز" }, { text: "گزارش هفتگی" }], [{ text: "کاربران" }, { text: "نمودار" }], [{ text: "📦 فروش و انبار" }]], resize_keyboard: true },
};
