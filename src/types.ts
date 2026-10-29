import type { Board } from "./board";

export interface Env {
  BOARD: DurableObjectNamespace<Board>;
  TTL_SECONDS: number;
  WRITE_TOKEN?: string;
  READ_RATE_LIMITER: RateLimit;
  WRITE_RATE_LIMITER: RateLimit;
}

export interface StoredRecord {
  [key: string]: string | number;
  payload: string;
  received_at: number;
}
