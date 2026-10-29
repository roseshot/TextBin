import type { Board } from "./board";

export interface Env {
  BOARD: DurableObjectNamespace<Board>;
  TTL_SECONDS: number;
  WRITE_TOKEN?: string;
}

export interface StoredRecord {
  payload: string;
  received_at: number;
}
