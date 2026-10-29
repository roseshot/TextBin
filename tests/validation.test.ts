import { describe, expect, test } from "bun:test";
import { InputError, parseJsonObject, readBodyWithinLimit } from "../src/validation";

describe("TextBin JSON input", () => {
  test("accepts new nested JSON objects without enforcing a fixed schema", () => {
    expect(
      parseJsonObject('{"service":"media-cache","healthy":true,"stats":{"hits":91}}'),
    ).toEqual({
      service: "media-cache",
      healthy: true,
      stats: { hits: 91 },
    });
  });

  test("rejects arrays, primitives, malformed JSON, and forged receive timestamps", () => {
    for (const body of [
      "[1,2]",
      "null",
      '"plain string"',
      '{"received_at":"forged"}',
      "{broken}",
    ]) {
      expect(() => parseJsonObject(body)).toThrow(InputError);
    }
  });

  test("rejects excessive nesting and too many nested entries", () => {
    const deep = '{"a":'.repeat(34) + "0" + "}".repeat(34);
    expect(() => parseJsonObject(deep)).toThrow(InputError);
    const many = Object.fromEntries(Array.from({ length: 129 }, (_, i) => ["k" + i, i]));
    expect(() => parseJsonObject(JSON.stringify(many))).toThrow(InputError);
    expect(parseJsonObject('{"a":{"b":[1,2,3]}}')).toEqual({ a: { b: [1, 2, 3] } });
  });

  test("limits actual streamed request bytes", async () => {
    const request = new Request("https://textbin.test/", {
      method: "POST",
      body: "123456789",
      headers: { "content-type": "application/json" },
    });
    await expect(readBodyWithinLimit(request, 5)).rejects.toMatchObject({
      status: 413,
    });
  });
});
