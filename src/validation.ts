export class InputError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InputError";
  }
}

// A byte limit alone does not bound recursive JSON serialization or display cost.
export const MAX_JSON_DEPTH = 32;
export const MAX_JSON_ENTRIES = 128;

export function parseJsonObject(body: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new InputError("Invalid JSON", 400);
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("JSON root must be an object", 422);
  }
  if (Object.hasOwn(value, "received_at")) {
    throw new InputError("received_at is a reserved field", 422);
  }

  let entries = 0;
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.value === null || typeof current.value !== "object") continue;
    if (current.depth > MAX_JSON_DEPTH) {
      throw new InputError("JSON exceeds maximum nesting depth", 422);
    }

    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value);
    entries += children.length;
    if (entries > MAX_JSON_ENTRIES) {
      throw new InputError("JSON contains too many fields or array elements", 422);
    }
    for (const child of children) {
      if (child !== null && typeof child === "object") {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return value as Record<string, unknown>;
}

export async function readBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    throw new InputError("JSON body is too large", 413);
  }

  if (!request.body) {
    throw new InputError("JSON body is required", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new InputError("JSON body is too large", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("Body must contain valid UTF-8", 400);
  } finally {
    reader.releaseLock();
  }
}
