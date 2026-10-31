import { routeUpdate } from "./router.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("shop-manager-bot OK");
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const update = await request.json();
    ctx.waitUntil(routeUpdate(update, env).catch((e) => console.error(e)));
    return new Response("ok");
  },
};
