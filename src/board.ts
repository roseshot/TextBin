import { DurableObject } from "cloudflare:workers";
import { renderBoard, renderRecordLines } from "./renderer";
import { calculateExpiration } from "./retention";
import type { Env, StoredRecord } from "./types";
import { InputError, parseJsonObject, readBodyWithinLimit } from "./validation";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_ACTIVE_RECORDS = 200;
const ALARM_RETRY_MS = 60_000;

function noCacheHeaders(contentType: string): HeadersInit {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: noCacheHeaders("application/json; charset=utf-8"),
  });
}

export class Board extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS records (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "payload TEXT NOT NULL, received_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"
    );
    this.ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS idx_records_expiry ON records(expires_at)",
    );
  }

  private async ensureAlarm(): Promise<void> {
    if (await this.ctx.storage.getAlarm() !== null) return;
    const { next_expiry } = this.ctx.storage.sql.exec<{ next_expiry: number | null }>(
      "SELECT MIN(expires_at) AS next_expiry FROM records",
    ).one();
    if (next_expiry !== null) {
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next_expiry));
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      // A later read repairs scheduling if an earlier alarm exhausted retries.
      try {
        await this.ensureAlarm();
      } catch (error) {
        console.error("Failed to repair cleanup alarm", error);
      }
      const now = Date.now();
      const records = this.ctx.storage.sql.exec<StoredRecord>(
        "SELECT payload, received_at FROM records WHERE expires_at > ? ORDER BY received_at DESC, id DESC",
        now,
      ).toArray();
      return new Response(renderBoard(records), {
        headers: noCacheHeaders("text/plain; charset=utf-8"),
      });
    }

    if (request.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    // Preserve anonymous writes when WRITE_TOKEN is not configured.
    if (
      this.env.WRITE_TOKEN &&
      request.headers.get("authorization") !== "Bearer " + this.env.WRITE_TOKEN
    ) {
      return errorResponse("Unauthorized", 401);
    }

    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
      return errorResponse("Content-Type must be application/json", 415);
    }

    try {
      const rawBody = await readBodyWithinLimit(request, MAX_BODY_BYTES);
      parseJsonObject(rawBody);
      const now = Date.now();
      const expiresAt = calculateExpiration(now, this.env.TTL_SECONDS);

      // Reject records whose fully rendered terminal output exceeds the budget.
      try {
        renderRecordLines({ payload: rawBody, received_at: now }, 1);
      } catch {
        throw new InputError("JSON exceeds terminal display budget", 422);
      }

      // Persist the record and its alarm schedule atomically.
      await this.ctx.storage.transaction(async () => {
        const { total } = this.ctx.storage.sql.exec<{ total: number }>(
          "SELECT COUNT(*) AS total FROM records WHERE expires_at > ?",
          now,
        ).one();
        if (total >= MAX_ACTIVE_RECORDS) {
          throw new InputError("Board is full; retry after older records expire", 507);
        }

        this.ctx.storage.sql.exec(
          "INSERT INTO records (payload, received_at, expires_at) VALUES (?, ?, ?)",
          rawBody,
          now,
          expiresAt,
        );
        const alarm = await this.ctx.storage.getAlarm();
        if (alarm === null || alarm > expiresAt) {
          await this.ctx.storage.setAlarm(expiresAt);
        }
      });
      return new Response(null, {
        status: 204,
        headers: noCacheHeaders("text/plain; charset=utf-8"),
      });
    } catch (error) {
      if (error instanceof InputError) {
        return errorResponse(error.message, error.status);
      }
      throw error;
    }
  }

  async alarm(): Promise<void> {
    try {
      this.ctx.storage.sql.exec("DELETE FROM records WHERE expires_at <= ?", Date.now());
      await this.ensureAlarm();
    } catch (error) {
      console.error("Failed to clean expired records; rescheduling", error);
      // Continue retrying beyond Cloudflare's finite automatic retry count.
      await this.ctx.storage.setAlarm(Date.now() + ALARM_RETRY_MS);
    }
  }
}
