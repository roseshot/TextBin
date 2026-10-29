import { describe, expect, test } from "bun:test";
import { calculateExpiration } from "../src/retention";

describe("configurable record retention", () => {
  test("uses the configured number of seconds", () => {
    expect(calculateExpiration(10_000, 90)).toBe(100_000);
    expect(calculateExpiration(10_000, 3600)).toBe(3_610_000);
  });

  test("rejects invalid or unsafe TTL configurations", () => {
    for (const ttl of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => calculateExpiration(10_000, ttl)).toThrow();
    }
  });
});
