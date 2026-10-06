# Shauri

Shauri is a persistent decision-support engine. It is not a generic chatbot and not yet a full personal assistant.

## Runtime architecture

```text
PA web app / WhatsApp / Telegram private chat
  -> channel-specific verification and identity
  -> authenticated PA API or inbound BullMQ queue
  -> idempotent message processing
  -> thread resolver
  -> intent router
  -> Shauri LangGraph
       dispatch
       intake
       skeptic
       ground
       close
  -> durable PostgreSQL state/checkpoints
  -> task/follow-up/human tools
  -> reply through the user's active channel
```

PA is maintained under `apps/pa/` in this repository. Its existing personal
workspace remains intact; the assistant now sends decision conversations to
Shauri through an authenticated API after the user links their WhatsApp
account. PA's local tasks, notes, finance, health, and calendar data are not
sent to Shauri.

## Stack

- TypeScript / NestJS
- PostgreSQL / Prisma
- LangGraph / LangChain
- BullMQ / Redis
- WhatsApp Cloud API
- optional Telegram user and operator channels
- Tavily
- optional M-Pesa Daraja payment gate

## Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
npm run start:dev
```

Run workers separately:

```bash
npm run start:worker
```

### One-command local startup and shutdown

Source the helper in a Bash terminal, then use its lifecycle functions:

```bash
source /home/mzizi/YourGuy/shauri/dev.sh
shauri_setup
shauri_configure_whatsapp
shauri_up
shauri_status
shauri_logs api
shauri_down
```

`shauri_up` checks local configuration/dependencies, generates a random
`PA_SESSION_SECRET` if it is missing (without printing it), applies pending
database migrations, builds Shauri, then starts the API, worker and PA
development server. It waits for the API readiness and PA HTTP health checks.
`shauri_down` sends `SIGTERM` to the process groups it started, waits for a
graceful exit, and only sends `SIGKILL` after the configured timeout. Logs and
PID state are written under ignored `.local/`. A server already running
outside the helper is detected and never killed or replaced.

Pressing `Ctrl+C` in the shell where the helper was sourced does not stop the
services; use `shauri_down`. Optional variables such as
`SHAURI_API_PORT=3000` and `SHAURI_PA_PORT=5173` may be set before sourcing.
Use `shauri_help` for all commands. The helper does not install or start
PostgreSQL/Redis daemons; it checks readiness through the API and tells you
when required services or configuration are unavailable.

If the setup check reports missing WhatsApp credentials, run
`shauri_configure_whatsapp`; it prompts in the local terminal without echoing
the values or sending them anywhere. Restart the API after changing settings.

### PA web app

`shauri_up` starts the PA development server and installs its dependencies
from the committed lockfile if they are missing. The Vite development server
proxies `/api/pa` to the Shauri API. Open the PA assistant, start linking, and
send the displayed one-time `/pa-link …` command to the Shauri WhatsApp
account you use. The link expires after 10 minutes. `shauri_up` applies
pending database migrations before it starts any services.

The production PA site should be served over HTTPS on the same origin as the
PA API (or behind a same-site reverse proxy). Set `PA_ALLOWED_ORIGINS` to the
exact comma-separated HTTPS browser origins. Browser sessions are stored as
hashed tokens and use HTTP-only, same-site cookies; the browser never receives
the shared session secret.

For local development without payment credentials:

```text
REQUIRE_PAYMENT=false
```

For the payment-gated flow:

```text
REQUIRE_PAYMENT=true
```

## Important production requirements

When `NODE_ENV=production`, both the API and worker fail startup unless the required configuration is present:

- `DATABASE_URL`
- `REDIS_HOST`
- one LLM provider: `ANTHROPIC_API_KEY`, `AWS_BEDROCK_MODEL_ID`, `DASHSCOPE_API_KEY`, or `NEBIUS_API_KEY`
- `TAVILY_API_KEY`
- WhatsApp Cloud API: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_VERIFY_TOKEN`
- Optional Telegram channel: `TELEGRAM_BOT_TOKEN` and a strong `TELEGRAM_WEBHOOK_SECRET` (configure both together)
- `INTERNAL_OPERATOR_TOKEN` with at least 32 characters
- `PA_SESSION_SECRET` with at least 32 characters, plus `PA_ALLOWED_ORIGINS`
  set to exact HTTPS origins
- `OPERATOR_WHATSAPP_PHONE` unless an operator Telegram chat is configured

Keep secrets in the deployment secret manager; never put live values in `.env` committed to source control, logs, images, or support tickets. Terminate HTTPS at the public ingress/load balancer and do not expose the Node port directly. The app sets HSTS in production; this assumes HTTPS is correctly enforced at the edge.

Build with `npm run build`, then run the API (`npm start`) and worker (`npm run start:worker:prod`) as separately supervised processes. For local development, use `npm run start:dev` and `npm run start:worker`. Apply committed Prisma migrations before deploying the new application version. Configure readiness/alerts for both processes, PostgreSQL, Redis, and the enabled outbound channels. Production payment mode (`REQUIRE_PAYMENT=true`) additionally requires Daraja credentials and callback configuration, and rejects the sandbox base URL; validate live payment activation separately.

`GET /health/live` is a process liveness probe. `GET /health/ready` checks PostgreSQL and Redis and returns HTTP 503 when either dependency is unavailable; use readiness for ingress/deployment gating and independently monitor the worker process.

## Telegram user channel

Telegram is an optional user-facing channel. Create a bot with BotFather, set `TELEGRAM_BOT_TOKEN` and a random `TELEGRAM_WEBHOOK_SECRET` of at least 32 characters, and apply the Prisma migrations. Keep secrets in local `.env` for development and in the hosting provider's secret manager for production; never commit them.

### Telegram operator alerts

To receive human-query and escalation alerts on Telegram, set `TELEGRAM_OPERATOR_SETUP_CODE` to a random value of at least 32 characters in `.env` (for example, generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Restart the API after changing `.env`. After starting the bot and registering its webhook, message the bot `/operator <setup-code>` from the private Telegram account that should receive operator alerts. The chat is linked once and stored in the database; subsequent notifications use that Telegram chat instead of WhatsApp. Alerts include a link to the Operator Desk when `OPERATOR_DASHBOARD_URL` is configured as an HTTPS URL ending in `/internal/human/dashboard`. The authenticated queue shows the 50 most recent recorded messages for each open handoff. Do not share the pairing code. Keep it in the production secret manager when using Telegram as the only operator channel; once paired, the database prevents that code from linking a different chat. To change the linked operator, an administrator must remove the `primary` row from `TelegramOperator` in PostgreSQL before pairing the new account. Existing `OPERATOR_WHATSAPP_PHONE` remains a fallback when no Telegram operator is linked.

### Local development with ngrok

Install ngrok and connect its CLI to your ngrok account once. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in `.env`, then run `npm run telegram:dev`. This single command starts the API in watch mode, launches `ngrok http <PORT>`, waits for the API health endpoint and ngrok's local inspector, then registers the matching HTTPS `/webhook/telegram` URL and webhook secret with Telegram. The local inspector must be enabled (ngrok's default). Leave the command running while testing; Ctrl+C stops both the API and ngrok.

The free/ephemeral ngrok URL may change when the tunnel restarts; restarting `npm run telegram:dev` automatically registers the new URL. The launcher needs the ngrok CLI on `PATH`; it does not install ngrok or configure the ngrok account. Use `npm run telegram:webhook:delete` when you no longer want Telegram to send updates to a local tunnel.

### Production hosting

Telegram requires a public HTTPS endpoint; do not configure plain HTTP in production. Set `TELEGRAM_WEBHOOK_URL` to the fixed hosting URL ending in `/webhook/telegram`, alongside the bot token and webhook secret in the production secret/environment configuration. Production startup rejects a Telegram configuration with a missing or non-HTTPS URL. After deployment, register or update the webhook from a trusted deployment/admin environment with `npm run telegram:webhook:set`; this command uses `TELEGRAM_WEBHOOK_URL` and does not use ngrok. Do not run the development tunnel command in production.

Do not expose the bot token or webhook secret in client code or logs.

Users must start the bot and share their own phone number through Shauri's contact button before messages are accepted. Shauri verifies Telegram's sender ID on the shared contact and links the chat to the existing phone-backed account; group chats and unlinked messages are not processed. Follow-ups, operator answers, operator escalation messages, and M-Pesa results are delivered through the user's most recently active channel. Operator alerts are sent to the paired Telegram operator chat when configured, with WhatsApp as fallback.

Telegram's basic bot API has no per-message platform fee; Shauri hosting, database, Redis, and model-provider usage may still incur costs.

## Human operations

Operator data APIs are protected with `x-operator-token`:

- `GET /internal/human/dashboard` — operator UI for queue, outcomes, and quality metrics
- `GET /internal/human/queue` — open operator queries and escalations with decision context
- `GET /internal/human/outcomes` — user-reported outcomes awaiting operator classification
- `GET /internal/human/metrics` — all-time decision and reviewed-outcome quality metrics
- `POST /internal/human/decisions/:threadId/outcome` — classify a decision outcome
- `POST /internal/human/queries/:id/answer` — answer an operator-owned query and resume Shauri
- `POST /internal/human/escalations/:id/notes` — record an internal case note
- `POST /internal/human/escalations/:id/message` — send a user update
- `POST /internal/human/escalations/:id/resolve` — resolve with an internal note and optional user-facing message

The dashboard page itself is public but contains no operator data; it prompts for a token before calling the protected APIs. See `docs/OPERATOR_WORKFLOW.md` for the case-handling procedure.

The authenticated queue API returns each handoff's question/reason, user contact and profile context, known facts, outstanding questions, decision record, available grounding evidence, and recent conversation transcript. The dashboard renders a selected subset of that context for operators.

Escalation cards provide a work log and a three-step operator workflow: record internal notes, send user updates, then resolve and notify the user. Outbound messages are sent through the user's active channel and recorded in both the case activity and thread transcript. A delivery failure leaves the escalation open so it can be retried.

Shauri replies include a concise decision status, such as waiting for user input, waiting for human verification, ready to close, referred to a human, or settled.

Publicly verifiable claims are researched through Tavily. If reliable evidence is unavailable, Shauri asks the user for identifying details or an authoritative source instead of assigning public research to an operator. Private facts controlled by a third party, such as a job offer's start date, are routed back to the user to obtain or document. Operator handoffs are reserved for information or actions within an authorized operator's organizational responsibility or system access. Reaching the follow-up limit stops reminders without creating an operator escalation; the decision remains open so the user can resume it later.

After a scheduled follow-up, the user's response is stored verbatim as an unclassified outcome report. Operators can review reports and classify them as `SUCCESSFUL`, `PARTIAL`, `UNSUCCESSFUL`, `NO_ACTION`, or `UNCLEAR`; the original user report and operator classification notes are retained separately.

The metrics endpoint is aggregate-only. Its successful-action rate denominator includes reviewed `SUCCESSFUL`, `PARTIAL`, and `UNSUCCESSFUL` outcomes; it excludes `NO_ACTION` and `UNCLEAR`. Rates are `null` when their denominator is zero.

The dashboard asks for the operator token and retains it only in the current browser tab's session storage. The APIs remain token-protected; the dashboard does not embed an operator credential.

Set `OPERATOR_WHATSAPP_PHONE` to the operator's WhatsApp number to receive queued human-query and escalation alerts, or pair a private Telegram chat using the Telegram operator setup above. When paired, Telegram is preferred; WhatsApp is the fallback when no Telegram operator chat is linked. The worker retries delivery and retains pending notification records in PostgreSQL for recovery if Redis or the selected channel is unavailable. Run `npm run start:worker` alongside the API. Configure a WhatsApp operator number to be eligible for business-initiated messages under Meta's WhatsApp rules; failed sends remain pending and are retried.

The closing pass requires a validated recommendation contract: a recommendation and bounded confidence estimate are stored together, with assumptions, unresolved risks, and unanswered material questions kept distinct. If the agent cannot justify a recommendation, both recommendation and confidence are left unset; invalid or contradictory model output fails instead of being replaced with synthetic defaults.

Decision records retain `recommendedAt` and `closedAt`; closure is recorded only after explicit user confirmation. The operator metrics include recommendation/evidence coverage, confirmed closure among records with recommendations, low-confidence recommendation counts (<50%, descriptive only), time to recommendation/resolution, stale open decisions, operator handoff response/resolution rates, and a returning-user proxy (at least two inbound WhatsApp message-days among users with any inbound WhatsApp message). Operator-query response rate uses all operator queries (open, answered, or cancelled) as its denominator. Rates are null when their denominator is zero.

Agent interactions are scoped to the requester's own thread and require an explicit responder capability and permission grant. An answer must name the interaction's addressed responder; request and response messages are auditable and a request cannot be answered twice. Cross-user sharing still requires an explicit permission and should be limited to the requested payload. This protocol foundation is not yet exposed through an externally authenticated agent-network gateway.

An inbound reply to an outcome follow-up is intercepted before intent routing and the decision graph. It is stored with an acknowledgement and completes that turn. If multiple follow-ups are pending, Shauri asks the user to select the relevant matter before recording the outcome.

## Architecture status

PA is included under `apps/pa/`; only its assistant currently calls Shauri.
The rest of PA's workspace continues to use browser-local storage and is not
shared with the decision engine. See `docs/PA_SHAURI_INTEGRATION.md` for the
account-linking flow, security boundary, development setup, and deployment
requirements.

See `docs/IMPLEMENTATION_STATUS.md` for the documentation-to-code
implementation map and remaining environment-dependent verification.

## Product documentation

To close the remaining product gap and define the user-facing operating model, see:

- `docs/PRODUCT_GAP_ANALYSIS.md` — product gap analysis and gap closure plan
- `docs/PRODUCT_BLUEPRINT.md` — product blueprint, decision contract, and roadmap
- `docs/INFORMATION_AUTHORITY.md` — source-routing policy for user, system, external, and operator information
- `docs/OPERATOR_WORKFLOW.md` — operator handoff, escalation, communication, and resolution procedures
- `docs/edge-case-simulation.md` — close confirmation and bounded follow-up behavior
- `docs/cross-domain-simulation.md` — context connection implementation and limitations
