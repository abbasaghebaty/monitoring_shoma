import { routeUpdate } from "./router.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("shop-manager-bot OK");
    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }
    ctx.waitUntil(routeUpdate(update, env).catch((error) => console.error(error)));
    return new Response("ok");
  },
};
