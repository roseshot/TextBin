# TextBin

**TextBin** is a temporary JSON inbox rendered as a Unicode plain-text board for `curl`. Send JSON to **POST /**, then use **GET /** to view **all** unexpired records, newest first. Each record includes the UTC time at which TextBin received it.

Built for **Cloudflare Workers Free**, **SQLite-backed Durable Objects**, **TypeScript (ES2026)**, and **Bun**. No web frontend, per-record URLs, ORM, or application-level Node.js APIs.

## Quick start

Install dependencies with Bun, then start the local Worker:

```sh
bun install
bun run dev
```

Send a JSON object (POST returns HTTP 204):

```sh
curl -i -X POST http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{"message":"Nightly backup finished","source":"scheduler","duration_ms":428}'
```

Read the entire unexpired inbox:

```sh
curl -sS http://localhost:8787/
```

The response is UTF-8 **text/plain**, with a box-drawing border and the complete set of JSON fields. It looks like this (time is illustrative):

```text
╭────────────────────────────────────────────────────────────────────────────╮
│ TEXTBIN  ·  1 record                                                       │
├────────────────────────────────────────────────────────────────────────────┤
│   #1                                                                       │
│   message      Nightly backup finished                                     │
│   source       scheduler                                                   │
│   duration_ms  428                                                         │
│   received_at  2026-10-29T10:00:00.000Z                                    │
╰────────────────────────────────────────────────────────────────────────────╯
```

The number of spaces in the sample above is for illustration; the renderer calculates line widths using terminal display cells rather than JavaScript string length. Additional JSON objects are appended as separate records and displayed in **reverse chronological order**.

## API contract

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/` | Accept a JSON object; retain it for the configured TTL (default **3600 seconds**); respond `204 No Content`. |
| `GET` | `/` | Render **every unexpired record** as `text/plain; charset=utf-8`. |

Only the root route exists. There is **no** `GET /{id}`, no separate JSON endpoint, and no pagination in this MVP. Unknown routes return 404; unsupported methods return 405.

- The JSON root must be an object, not an array or primitive. Nested objects, arrays, strings, numbers, booleans and null are accepted as field values.
- The `received_at` key is reserved for the server-generated UTC timestamp; uploads containing that key are rejected with 422.
- Multiline strings wrap in the terminal; nested JSON is rendered inline as JSON; control characters are escaped or replaced.
- No HTTP caching: `Cache-Control: no-store` on responses.

## Retention configuration

Set `TTL_SECONDS` under `vars` in `wrangler.jsonc`:

```jsonc
"vars": {
  "TTL_SECONDS": 3600
}
```

The value is a positive integer in **seconds**. Change it and redeploy to adjust how long **new uploads** remain available. Each record's expiration is calculated when it is received, so changing this variable does not extend or shorten the lifetime of existing records. Invalid, missing, or overflowing values fail on POST rather than silently falling back to a hardcoded retention period.

## Data retention and Free-plan guardrails

Data is stored in one **SQLite-backed Durable Object**. Each record has a server-assigned receive timestamp and an expiration timestamp calculated from `TTL_SECONDS`.

- **Logical expiration:** every GET excludes rows whose `expires_at` has passed, including before physical cleanup.
- **Physical cleanup:** a Durable Object Alarm deletes expired rows and reschedules itself for the next expiration.
- A maximum **16 KiB** JSON request body (measured as UTF-8 bytes).
- A maximum **200 simultaneously unexpired records**. On reaching capacity, POST returns 507 rather than silently dropping entries.
- Requests to the same named Durable Object have strongly consistent storage operations; a single board is appropriate for a small tool, not an unbounded high-throughput ingestion service.
- Anyone who can GET the service can read the whole board. Do not post secrets or private data.

An optional `WRITE_TOKEN` secret protects POST. **Set it before publicly deploying**:

```sh
bunx --bun wrangler login
bunx --bun wrangler secret put WRITE_TOKEN
bun run deploy
```

If `WRITE_TOKEN` is configured, include `Authorization: Bearer <token>` when uploading. GET remains publicly accessible.

## Development and validation

```sh
bun run typecheck
bun test
bun run check
```

`typecheck` first generates Worker type declarations via Wrangler, then checks the project with the pinned TypeScript 7.1 Beta for the ES2026 target. The lockfile `bun.lock` should be generated and committed after the first successful `bun install`.

Bun is the intended **local toolchain**. The deployed Worker runs in Cloudflare's **workerd**, not Bun. Cloudflare officially supports Node.js as Wrangler's CLI runtime; `bunx --bun wrangler` is a deliberately Bun-first workflow and should be validated on the development machine.

For decisions, constraints, and acceptance criteria, see [docs/PLAN.md](docs/PLAN.md).


## Layout

- `src/index.ts`: only `GET /` and `POST /`; routes both to the same Durable Object.
- `src/board.ts`: SQLite records, configurable expiration, Alarm cleanup, capacity guardrails.
- `src/retention.ts`: validates configured TTL and calculates per-record expiration.
- `src/renderer.ts`: terminal layout, safe text, Unicode/CJK display width.
- `src/validation.ts`: streamed UTF-8 byte limit and JSON object validation.
- `tests/`: Bun unit tests for input and rendering.
