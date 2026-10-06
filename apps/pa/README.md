# PA

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-geegmpcq)

PA is the browser-based personal workspace in this monorepo. Its existing
screens and local workspace are retained. The AI Assistant uses Shauri after
the user links an existing Shauri WhatsApp account.

## Run locally

From the Shauri repository root, configure `PA_SESSION_SECRET` in `.env`,
apply the Prisma migrations, and start the Shauri API and worker. Then:

```bash
npm ci --prefix apps/pa
npm run pa:dev
```

The Vite server proxies `/api/pa` to the local Shauri API. See
[`docs/PA_SHAURI_INTEGRATION.md`](../../docs/PA_SHAURI_INTEGRATION.md) for
account linking, data boundaries, security settings, and deployment notes.

PA's tasks, notes, calendar, finance, health, and other local workspace data
remain browser-local and are not currently shared with Shauri.
