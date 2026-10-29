import type { Env } from "./types";

export { Board } from "./board";

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    if (new URL(request.url).pathname !== "/") {
      return new Response("Not found\n", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method not allowed\n", {
        status: 405,
        headers: {
          allow: "GET, POST",
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // A single named Durable Object provides ordered writes and consistent reads.
    const id = env.BOARD.idFromName("global");
    return env.BOARD.get(id).fetch(request);
  },
};
