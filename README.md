# TextBin

[![CI](https://github.com/roseshot/TextBin/actions/workflows/ci.yml/badge.svg)](https://github.com/roseshot/TextBin/actions/workflows/ci.yml)

TextBin is a temporary JSON inbox for Cloudflare Workers. Send a JSON object to `POST /` and view **all unexpired records** with `GET /` in a readable, Unicode-framed terminal output. Each record includes a server-generated `received_at` timestamp.

One endpoint, one shared inbox, no frontend or per-record URLs.

## Quick start

**Requirements:** [Bun](https://bun.sh/) and [Node.js](https://nodejs.org/) for the Wrangler CLI.

```sh
bun install
bun run dev
```

In another terminal, upload a JSON object:

```sh
curl -i http://localhost:8787/ \
  -H 'Content-Type: application/json' \
  -d '{"message":"Nightly backup finished","source":"scheduler","duration_ms":428}'
```

The upload returns **`204 No Content`**. Retrieve the inbox:

```sh
curl -sS http://localhost:8787/
```

Example output (timestamp is illustrative):

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

Additional uploads appear as separate entries, **newest first**. The display includes every uploaded field; nested objects and arrays are rendered as JSON, and multiline text is wrapped to the terminal frame.

## API

| Method | Path | Response |
| --- | --- | --- |
| `POST` | `/` | Accept a JSON object and store it for the configured TTL. Returns `204` on success. |
| `GET` | `/` | Return all currently unexpired records as `text/plain; charset=utf-8`. |

The API has no record IDs, individual retrieval endpoints, pagination, or web UI.

**Upload rules and limits:**
- The request must use `Content-Type: application/json` and contain a JSON **object** (not an array or primitive).
- `received_at` is reserved and set by the server in UTC; uploads cannot supply it.
- Maximum request body: **16 KiB** of UTF-8.
- Maximum active records: **200**. Further writes return `507` until space becomes available.
- Maximum nesting depth: **32**. At most **128** nested object properties and array elements combined.
- At most **128** rendered terminal lines per record. Oversized or overly complex objects return `422` instead of being stored.
- Existing records that are corrupt or cannot render within this budget show a placeholder; other records remain readable.
- Invalid requests return an HTTP error: `400` (invalid JSON), `413` (too large), `415` (wrong media type), or `422` (invalid root or reserved field). When write authentication is enabled, unauthorized uploads return `401`.
- Other routes return `404`; unsupported methods on `/` return `405`.

Responses set `Cache-Control: no-store`. `GET /` is public, even when write authentication is enabled. Worker-edge rate limits apply per client IP and Cloudflare location: **120 GET/minute** and **30 POST/minute**. Exceeded limits return `429` with `Retry-After: 60`. Rate limits are approximate rather than strict global quotas; IPs shared by multiple clients also share the quota.

## Configuration

Retention is controlled by `TTL_SECONDS` in [`wrangler.jsonc`](wrangler.jsonc):

```jsonc
"vars": {
  "TTL_SECONDS": 3600
}
```

The value is a **positive integer in seconds** (default: **3600**, or one hour). Change it and redeploy to update retention for **new uploads**. Existing records retain their original expiration times. Invalid or missing TTL values cause uploads to fail rather than silently applying an alternative.

TextBin uses one **SQLite-backed Durable Object** to store the shared inbox. Reads exclude expired records immediately; a Durable Object Alarm removes expired data from storage afterward. Writes and alarm scheduling run in one storage transaction. Cleanup errors schedule a retry; a later read can also restore a missing alarm. No separate KV, D1, or Cron configuration is required.

### Write authentication

By default, anyone who can reach the Worker can upload. To require a bearer token for `POST /`, configure the optional `WRITE_TOKEN` secret:

```sh
bunx wrangler secret put WRITE_TOKEN
```

Then include `Authorization: Bearer <token>` when posting. **The inbox remains publicly readable.** Do not upload credentials, secrets, or private data.

## Deployment

Sign in to Cloudflare and deploy:

```sh
bunx wrangler login
bun run deploy
```

**Public URL configuration is required.** The repository sets `workers_dev: false` and `preview_urls: false`, and does not supply a domain or route. Attach a **Custom Domain** or configure a **Worker Route** in Cloudflare before expecting the deployed Worker to be accessible publicly.

For a public instance, consider configuring `WRITE_TOKEN` to restrict uploads. Anonymous writing remains the default by design. Review the Workers Free and Durable Objects quotas for your expected usage.

## Development and CI

```sh
bun run check                    # Generate Worker types, typecheck, and run Bun tests
bunx wrangler deploy --dry-run  # Validate the Worker bundle without deploying
```

GitHub Actions runs these checks on pushes to `main`, pull requests, and manual dispatch. CI uses `actions/checkout@v7` and `oven-sh/setup-bun@v2`; it does **not** deploy to Cloudflare or require deployment credentials.

Bun manages dependencies and runs the tests. Wrangler is invoked via `bunx wrangler` **without `--bun`** because its CLI requires Node.js. The deployed Worker runs on Cloudflare's `workerd`, not Node.js. CI pins Bun to a specific version and uses stable TypeScript. `bun.lock` is committed, and CI uses `bun install --frozen-lockfile` for reproducible installs.

For implementation details and acceptance criteria, see [docs/PLAN.md](docs/PLAN.md). License details are in [LICENSE](LICENSE).
