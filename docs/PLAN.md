# TextBin - MVP Plan

## Goal

A temporary, root-route-only inbox for **complete JSON objects**. Every upload remains visible for the configured **TTL** (default: **3600 seconds**) and can be viewed alongside other unexpired uploads as a single, human-readable, UTF-8 **plain-text** dashboard from `curl`.

## Contract (fixed)

| Action | Endpoint | Behavior |
| --- | --- | --- |
| Upload | `POST /` | Validate and persist an arbitrary JSON object; return `204`. |
| View board | `GET /` | Display **all** unexpired records, newest first, including the server receipt timestamp. |

No per-record IDs, generated URLs, front end, or JSON GET API. Payloads are not expected to contain any presentation markup.

## Example (illustrative, not a preset)

Upload a deployment event:

```json
{
  "service": "media-cache",
  "event": "deployment_succeeded",
  "region": "fra",
  "duration_ms": 312
}
```

The `GET /` view places those four fields and `received_at` together inside the same numbered record on the TextBin board. Other uploads appear as additional numbered records. The examples are test data only; TextBin does not seed production data.

## Data model

Single named Durable Object (one global board), SQLite table `records`:

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | INTEGER PRIMARY KEY | Internal deterministic tie-break; never exposed. |
| `payload` | TEXT | Entire original JSON body. |
| `received_at` | INTEGER | Server-assigned UTC epoch milliseconds. |
| `expires_at` | INTEGER | `received_at + TTL_SECONDS * 1000`. |

On POST, `TTL_SECONDS` is read from the Wrangler `vars` binding and validated as a positive integer. The default is configured in `wrangler.jsonc` (3600 seconds), not hardcoded in source. Each record keeps the expiry determined at ingestion, even if the configuration later changes. `GET` filters `expires_at > now`, orders by `received_at DESC, id DESC`, and renders the complete result. An Alarm opportunistically deletes expired rows, retries cleanup after errors, and can be restored by a later GET. Upload and alarm scheduling run in a storage transaction. The alarm is **not** relied on for exact read-time expiration.

## Terminal renderer

- `Content-Type: text/plain; charset=utf-8`; `Cache-Control: no-store`.
- One Unicode frame for the whole board, one separator and numbered group per record.
- Include **every** property from the original JSON, then `received_at` in ISO 8601 UTC in the same group.
- Strings preserve meaningful newlines, terminal-control characters cannot inject ANSI escapes, and wide CJK/emoji display widths are accounted for.
- Arrays and nested objects remain readable as JSON values; no speculative field-specific widget rendering.
- No records: a `No data available.` message inside the board.
- Do not truncate or paginate unexpired records: instead cap the active inbox to keep it affordable.

## Platform and toolchain

- **Worker runtime:** Cloudflare `workerd` (Workers Free).
- **Storage:** Durable Objects SQLite with Cloudflare declarative `exports` configuration.
- **Type checking:** TypeScript 7.0 with `ES2025` target and lib, strict mode.
- **Local package manager, scripts, and tests:** Bun; no Node.js imports or Bun runtime APIs inside the deployed code.
- **Wrangler CLI:** invoked through `bunx wrangler` (without `--bun`), allowing its supported Node.js CLI runtime. Bun remains the dependency manager, test runner, and script runner; the deployed Worker uses `workerd`.

## Guardrails

- Up to 16 KiB incoming JSON per POST; streaming reader enforces actual byte count.
- Limit JSON depth to 32 and total nested object properties/array elements to 128.
- Bound the rendered size of each record to 128 lines; isolate legacy corrupt or oversized records during reads.
- Apply approximate Worker-edge rate limiting per client IP and Cloudflare location: 120 GET/minute and 30 POST/minute.
- Maximum 200 unexpired records; an over-capacity POST is rejected with 507.
- Optional Bearer secret protects POST. Anonymous uploads remain enabled when the secret is absent; GET is intentionally public. Avoid sensitive data.
- Incoming `received_at` is rejected to prevent spoofing the server timestamp.
- Unsupported content types and invalid input return 4xx statuses, with JSON error bodies.


## Acceptance criteria

1. Posting a valid JSON object to `/` returns 204 without a generated ID or URL.
2. Reading `/` displays all unexpired objects and the precise server receipt time **within each record**.
3. Output is readable in a normal UTF-8 terminal, including CJK text and multiline values.
4. Data is no longer returned when `received_at + TTL_SECONDS * 1000` has passed, using the TTL captured when it was uploaded, even if cleanup has not run.
5. Invalid JSON, unsupported methods/routes, oversized requests, and reserved fields are rejected.
6. The source tree contains no Node.js runtime API dependency.
7. Development, tests and deployment are driven through Bun scripts; Cloudflare itself runs the Worker.
8. The repository retains the original license and uses `TextBin` for its public-facing project identity.
