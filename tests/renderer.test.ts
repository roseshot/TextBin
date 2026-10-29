import { describe, expect, test } from "bun:test";
import { displayWidth, renderBoard } from "../src/renderer";

describe("TextBin terminal board", () => {
  test("renders complete data with a UTC receipt time in each record", () => {
    const output = renderBoard([
      {
        payload: '{"message":"Nightly backup finished","source":"scheduler","duration_ms":428}',
        received_at: 0,
      },
      {
        payload: '{"event":"deployment_succeeded","details":{"region":"fra"},"tags":["stable","blue"]}',
        received_at: 1000,
      },
    ]);

    expect(output).toContain("TEXTBIN");
    expect(output).toContain("2 records");
    expect(output).toContain("Nightly backup finished");
    expect(output).toContain("scheduler");
    expect(output).toContain("duration_ms");
    expect(output).toContain("428");
    expect(output).toContain("deployment_succeeded");
    expect(output).toContain('{"region":"fra"}');
    expect(output).toContain('["stable","blue"]');
    expect(output).toContain("1970-01-01T00:00:00.000Z");
    expect(output).toContain("1970-01-01T00:00:01.000Z");
    expect(output).not.toContain("[object Object]");
  });

  test("isolates corrupt, oversized, and deeply nested legacy records", () => {
    const deep = '{"a":'.repeat(7000) + "0" + "}".repeat(7000);
    const output = renderBoard([
      { payload: '{"valid":true}', received_at: 0 },
      { payload: "{broken}", received_at: 0 },
      { payload: JSON.stringify({ note: "x".repeat(12000) }), received_at: 0 },
      { payload: deep, received_at: 0 },
    ]);
    expect(output).toContain("valid");
    expect(output.match(/Record unavailable/g)?.length).toBe(3);
  });

  test("shows a human-readable empty board", () => {
    expect(renderBoard([])).toContain("No data available.");
  });

  test("handles multiline content, terminal escapes, and CJK widths", () => {
    const output = renderBoard([
      {
        payload: JSON.stringify({ note: "Line one\nLine two\u001b[31m" }),
        received_at: 0,
      },
    ]);
    expect(output).toContain("Line one");
    expect(output).toContain("Line two");
    expect(output).not.toContain("\u001b");
    expect(displayWidth("\u4e2d\u6587ab")).toBe(6);
    expect(renderBoard([{ payload: JSON.stringify({ key: "safe\u200e" }), received_at: 0 }])).not.toContain("\u200e");
    for (const line of output.trimEnd().split("\n")) {
      expect(displayWidth(line)).toBe(78);
    }
  });
});
