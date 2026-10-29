import type { Env } from "./types";
import { checkRateLimit } from "./rate-limit";

export { Board } from "./board";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/") {
      return new Response("Not found\n", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: {
          allow: "GET, POST",
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }

    const limiter = request.method === "GET" ? env.READ_RATE_LIMITER : env.WRITE_RATE_LIMITER;
    const limited = await checkRateLimit(request, limiter);
    if (limited) return limited;

    // One shared inbox intentionally remains a single Durable Object.
    return env.BOARD.get(env.BOARD.idFromName("global")).fetch(request);
  },
};
