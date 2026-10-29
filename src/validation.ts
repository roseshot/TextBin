export class InputError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InputError";
  }
}

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

  // Keep the server-generated timestamp authoritative, without dropping input.
  if (Object.hasOwn(value, "received_at")) {
    throw new InputError("received_at is a reserved field", 422);
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
