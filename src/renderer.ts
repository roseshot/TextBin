import type { StoredRecord } from "./types";

const FRAME_WIDTH = 78;
const CONTENT_WIDTH = FRAME_WIDTH - 4;
const MAX_LABEL_WIDTH = 24;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Counts terminal display cells rather than JavaScript string units.
export function displayWidth(text: string): number {
  let width = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (/^[\p{Mark}\p{Format}]+$/u.test(segment)) continue;
    if (/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(segment)) {
      width += 2;
      continue;
    }
    const point = segment.codePointAt(0) ?? 0;
    width +=
      (point >= 0x1100 && point <= 0x115f) ||
      (point >= 0x2e80 && point <= 0xa4cf) ||
      (point >= 0xac00 && point <= 0xd7a3) ||
      (point >= 0xf900 && point <= 0xfaff) ||
      (point >= 0xfe10 && point <= 0xfe6f) ||
      (point >= 0xff01 && point <= 0xff60) ||
      (point >= 0xffe0 && point <= 0xffe6)
        ? 2
        : 1;
  }
  return width;
}

function safeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "�")
    .replace(/[\u202a-\u202e\u2066-\u2069]/gi, "�");
}

function pad(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function wrap(line: string, width: number): string[] {
  const result: string[] = [];
  let chunk = "";
  let used = 0;
  for (const { segment } of segmenter.segment(line)) {
    const size = displayWidth(segment);
    if (used + size > width && chunk) {
      result.push(chunk);
      chunk = "";
      used = 0;
    }
    chunk += segment;
    used += size;
  }
  result.push(chunk);
  return result;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return safeText(value);
  return safeText(JSON.stringify(value) ?? "null");
}

function cell(line: string): string {
  return "│ " + pad(line, CONTENT_WIDTH) + " │";
}

function row(line = ""): string[] {
  return line.split("\n").flatMap((part) => wrap(part, CONTENT_WIDTH).map(cell));
}

function field(key: string, value: unknown, labelWidth: number): string[] {
  const label = safeText(key).replace(/\n/g, "\\n") || '""';
  const text = formatValue(value);

  if (displayWidth(label) > MAX_LABEL_WIDTH) {
    return row(label + ": " + text);
  }

  const prefix = "  " + pad(label, labelWidth) + "  ";
  const indent = " ".repeat(displayWidth(prefix));
  const available = Math.max(1, CONTENT_WIDTH - displayWidth(prefix));
  return text.split("\n").flatMap((line, index) =>
    wrap(line, available).map((part, partIndex) =>
      cell((index === 0 && partIndex === 0 ? prefix : indent) + part),
    ),
  );
}

export function renderBoard(records: readonly StoredRecord[]): string {
  const lines = [
    "╭" + "─".repeat(FRAME_WIDTH - 2) + "╮",
    cell("TEXTBIN  ·  " + records.length + " record" + (records.length === 1 ? "" : "s")),
  ];

  if (records.length === 0) {
    lines.push("├" + "─".repeat(FRAME_WIDTH - 2) + "┤", ...row("  No data available."));
  }

  for (const [index, record] of records.entries()) {
    lines.push("├" + "─".repeat(FRAME_WIDTH - 2) + "┤");
    lines.push(cell("  #" + (index + 1)));
    const data = JSON.parse(record.payload) as Record<string, unknown>;
    const fields: [string, unknown][] = [
      ...Object.entries(data),
      ["received_at", new Date(record.received_at).toISOString()],
    ];
    const labelWidth = Math.min(
      MAX_LABEL_WIDTH,
      Math.max(0, ...fields.map(([key]) => displayWidth(safeText(key)))),
    );
    for (const [key, value] of fields) {
      lines.push(...field(key, value, labelWidth));
    }
  }

  lines.push("╰" + "─".repeat(FRAME_WIDTH - 2) + "╯");
  return lines.join("\n") + "\n";
}
