import { describe, expect, test } from "bun:test";
import { checkRateLimit } from "../src/rate-limit";

describe("Worker edge rate limits", () => {
  test("uses the Cloudflare client address as its key", async () => {
    let key = "";
    const response = await checkRateLimit(
      new Request("https://textbin.test/", { headers: { "cf-connecting-ip": "192.0.2.1" } }),
      { async limit(options) { key = options.key; return { success: true }; } },
    );
    expect(response).toBeNull();
    expect(key).toBe("192.0.2.1");
  });

  test("returns a non-cacheable HTTP 429", async () => {
    const response = await checkRateLimit(
      new Request("https://textbin.test/"),
      { async limit(options) { expect(options.key).toBe("unknown"); return { success: false }; } },
    );
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("60");
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });
});
