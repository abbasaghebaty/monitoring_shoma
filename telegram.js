export async function sendMessage(env, chatId, text, extra = {}) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
  if (!res.ok) console.error("sendMessage failed", await res.text());
}

export const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [[{ text: "ورود" }, { text: "خروج" }], [{ text: "وضعیت" }]],
    resize_keyboard: true,
  },
};
