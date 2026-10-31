import { routeUpdate } from "./router.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") return new Response("monitoring_shoma OK");
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    ctx.waitUntil(routeUpdate(update, env).catch((error) => console.error("update error:", error)));
    return new Response("ok");
  },
};
