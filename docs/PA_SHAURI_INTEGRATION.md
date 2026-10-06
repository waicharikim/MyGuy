# PA and Shauri integration

## Repository layout

The existing Shauri API/worker remains at the repository root. The existing
PA React/Vite progressive web app lives in `apps/pa/`; its screens and local
workspace have been retained. PA can be developed and built independently
with the root `pa:dev`, `pa:build`, and `pa:lint` scripts.

## First connected workflow

Only the PA assistant is connected to Shauri in this integration. PA's tasks,
notes, calendar, finance, health, habits, goals, and other data remain in the
existing browser `localStorage` store. None of that local PA data is sent to
Shauri or included in its model context.

Users link PA to an existing Shauri WhatsApp identity:

1. PA requests a one-time link challenge from `POST /api/pa/link`.
2. The browser receives an HTTP-only, same-site link cookie and displays a
   high-entropy command such as `/pa-link ABCDE23456`.
3. The user sends that command from their own WhatsApp account to Shauri.
   The signed WhatsApp webhook associates the pending challenge with that
   phone-backed Shauri user.
4. PA polls `GET /api/pa/link/status`; on success the API exchanges the
   short-lived link cookie for a 30-day HTTP-only session cookie.
5. Assistant messages are passed into Shauri's existing inbound orchestration
   under the linked user's identity, using the same thread resolver, policy,
   tools, and decision graph as the messaging channels.

The linking code expires after 10 minutes, is stored as an HMAC hash, and link
creation is rate-limited per source IP. Sessions are opaque random values;
only their HMAC hashes are stored. Mutating API requests require an allowed
browser `Origin`. Production startup requires a strong `PA_SESSION_SECRET` and
an exact comma-separated list of HTTPS `PA_ALLOWED_ORIGINS`.

## Development

1. Source the local helper and start the integrated services:

   ```bash
   source /home/mzizi/YourGuy/shauri/dev.sh
   shauri_setup
   shauri_configure_whatsapp
   shauri_up
   ```

   The helper generates a random `PA_SESSION_SECRET` when missing, applies
   pending migrations, builds Shauri, starts the API/worker/PA, and checks
   readiness. WhatsApp settings are prompted locally with input hidden.
2. Open PA at `http://127.0.0.1:5173/` and use the Assistant to link your
   existing Shauri WhatsApp account. Use `shauri_status`, `shauri_logs`, and
   `shauri_down` to manage the local processes.

Vite proxies `/api/pa` to the API port chosen by `SHAURI_API_PORT` (default
3000). The helper automatically adds the selected localhost/127.0.0.1 PA
origin to the local `.env` allowlist.

## Production deployment

Serve PA over HTTPS and route its `/api/pa` requests to the Shauri API on the
same site, preferably through the same-origin ingress/reverse proxy. Configure
`PA_ALLOWED_ORIGINS` to the exact HTTPS origin (scheme and host, without a
path). The session cookie is `Secure` in production. Do not expose a server
secret in Vite variables, JavaScript, local storage, or URLs. Apply the
`20261006120000_pa_web_link` Prisma migration before deploying the API.

## Current boundaries

- The integration exposes the decision assistant, not Shauri's operator
  dashboard or database administration.
- PA data is not synchronized or shared with Shauri; this would require a
  separate user-consented data contract and source/permission model.
- Shauri's human query and escalation responses continue through the user's
  active supported messaging channel (WhatsApp or Telegram). While a PA
  decision thread is open, PA refreshes its transcript from Shauri; the user
  should also check WhatsApp for operator follow-up.
- PA continues to run as a separate frontend build inside the monorepo. A
  deployment must explicitly serve its built assets and route API requests;
  this repository does not silently replace the existing Shauri API host.
- This browser link is for the user's own Shauri identity. It does not provide
  authorization to view another person's account or an unrelated third
  party's private information.
