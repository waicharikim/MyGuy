# Shauri v0.2 Implementation Status

This document maps the current repository to its implementation and records checks that still require a configured staging or production environment.

## 1. Domain/data alignment

Implemented:
- typed thread/message/payment/follow-up states via Prisma enums
- external channel message IDs and uniqueness
- durable graph checkpoints
- grounding evidence
- human queries and messages
- human escalations and messages
- knowledge candidates
- agent/capability/permission/interaction models
- payment external-message idempotency

## 2. Inbound pipeline

Implemented:

`WhatsApp signature / Telegram secret and private-chat validation -> BullMQ -> idempotent processing -> thread resolution -> routing -> Shauri graph -> persisted reply -> user's active channel`

The HTTP webhook returns quickly. The actual reasoning work occurs in the inbound worker.

## 3. Thread resolution

Implemented:
- exact awaiting-response continuation
- single-open-thread continuation
- model-assisted candidate matching when several threads are open
- explicit ambiguity response
- no "pick newest" fallback

## 4. State machine

Implemented in `src/domain/thread.ts`.

The application owns transitions; the model cannot directly close or escalate a thread.

## 5. Four-pass engine

Implemented as a real LangGraph execution path:

`dispatch -> intake -> skeptic -> ground -> close`

`dispatch` selects the persisted resume pass, so the graph can re-enter at the persisted pass without a separate hand-written orchestrator.

Each pass writes a durable `GraphCheckpoint` to PostgreSQL. This is the application-level durability layer; it deliberately does not pretend that the old LangGraph package version provides a PostgreSQL checkpointer. The persisted pass is the resume contract.

## 6. Structured reasoning

Intake, Skeptic, Ground and Close all request structured JSON and validate with defensive parsing. Invalid model output fails closed rather than being treated as trustworthy state.

The closing pass enforces a typed decision contract for user-facing next action, optional recommendation, bounded confidence, assumptions, unresolved risks, unanswered material questions, and mutually exclusive resolved/escalated/human-query outcomes. Open questions are persisted separately from assumptions and exposed in operator handoffs. A recommendation is shown with its confidence estimate; if no recommendation is justified, recommendation and confidence remain null.

## 7. Grounding

Implemented:
- claim extraction
- search-query derivation
- Tavily search
- source normalization
- `GroundingEvidence` persistence
- when public research is unavailable or returns no usable evidence, ask the user for an authoritative source or identifying details rather than assigning internet research to an operator
- retain Tavily source URL/title/finding for operator review

## 8. Human Query / Handoff

Implemented:
- durable Human Query records
- pause/resume state
- authenticated operator dashboard for human handoffs, outcome review, quality metrics, and escalation work logs
- operator answer endpoint
- authenticated operator queue with decision, profile, evidence, and recent transcript context
- operator escalation workflow for internal notes, user updates through the user's active channel, and resolution with a separate user-facing message
- outbound operator escalation messages recorded in the thread transcript and escalation activity
- delivery failures leave escalations open; resolution is applied only after successful delivery
- "Awaiting operator" dashboard metric counts open operator-owned human queries and links to the queue
- user-reported post-follow-up outcomes, preserved for operator classification
- inbound outcome replies acknowledged and short-circuited before intent routing/graph execution
- explicit numbered matter selection when multiple outcome follow-ups are pending
- authenticated outcome review and classification endpoints
- aggregate decision-quality metrics endpoint with explicit denominator semantics
- knowledge-candidate promotion from human answers
- durable Escalation records and separate operator/user activity entries
- operator note, user-message, and resolution endpoints

The operator data endpoints are protected by `INTERNAL_OPERATOR_TOKEN`. The static dashboard login page is public and contains no operator data.

Operator-channel human queries and escalations create durable PostgreSQL notification records. Telegram is preferred when an operator has paired a private chat; otherwise alerts use WhatsApp at `OPERATOR_WHATSAPP_PHONE`. The worker retries delivery and scans pending records after restart or queue outages. Live delivery still requires valid credentials and a deliverable recipient.

Telegram user messaging is implemented as an optional channel with verified contact sharing, persistent Telegram-to-user identity, secret-token webhook validation, private-chat-only inbound processing, and channel-aware replies, follow-ups, operator-resume responses, operator escalation messages, and M-Pesa callbacks. Group chats are intentionally ignored. Before enabling it in production, configure the bot token/webhook secret, apply the identity migration, register the HTTPS webhook, and verify contact linking, duplicate-update handling, and outbound delivery with a Telegram test account.

Telegram operator alerts can be enabled by pairing one private chat with `/operator <setup-code>` using `TELEGRAM_OPERATOR_SETUP_CODE`; the resulting destination is stored in `TelegramOperator` and operator notifications use it in preference to WhatsApp. WhatsApp remains the fallback when no Telegram operator is paired. Authenticated Operator Desk queue entries include the 50 most recent thread messages; alerts link to the desk when `OPERATOR_DASHBOARD_URL` is configured. See `docs/OPERATOR_WORKFLOW.md` for the operator procedure and endpoint contract.

## 9. Follow-up reliability

Implemented:
- separate BullMQ worker
- idempotency key
- processing/sent/cancelled states
- retryable worker failures
- maximum follow-up guardrail (`MAX_FOLLOWUPS`, default `4`)
- reaching the maximum stops further reminders and clears the pending outcome wait; it does not itself create an operator escalation, and the decision remains open for the user to resume
- explicit outcome request marker and idempotent outcome capture
- channel-aware outbound delivery

## 10. Observability

LangChain/LangGraph tracing can be enabled through the existing LangSmith environment variables. Graph invocations use the Shauri thread ID as the trace/thread identity.

## 11. M-Pesa

Implemented/hardened:
- configurable payment gate (`REQUIRE_PAYMENT=true`)
- STK push initiation
- external-message idempotency
- callback idempotency
- payment failure notification
- sandbox/base URL configuration

Still requires a real Daraja sandbox verification before production use.

## 12. Agent network

The persistence model and permission-checked interaction service now exist. Agents can be associated with a user, interactions cannot attach a thread outside the requester's ownership, answers must identify the addressed responder, and request/response messages are retained. A controlled two-agent integration test covers explicit grants and denied cross-user thread context. This is intentionally a protocol foundation rather than an autonomous multi-agent swarm; an externally authenticated agent-network gateway is still future work.

## 13. Product quality metrics

The operator metrics report all-time recommendation and evidence coverage, recommendation-confirmation rate (resolved matters with recommendations divided by matters with recommendations), low-confidence recommendation count (<50%), average recommendation/resolution time, decisions open or awaiting a human for more than seven days, operator-query response rate (answered divided by all operator queries), escalation resolution rate, and returning-user proxy (users with inbound WhatsApp messages on at least two distinct days, divided by users with any inbound WhatsApp message). The dashboard's "Awaiting operator" card counts only open operator-owned queries and links to the handoff queue; escalations have a separate metric. The endpoint preserves outcome metrics and returns null for ratios/timing without a denominator. These are operational indicators; they do not establish recommendation quality or calibrated confidence.

## 14. What remains environment-dependent

These cannot be honestly marked as staging/production-verified inside this environment:

- real Meta WhatsApp webhook signature verification against a live app
- real WhatsApp Cloud API delivery
- full LangGraph behavior with live LLM structured output, evidence persistence, and user-source fallback when public research is insufficient
- real Safaricom Daraja callbacks/STK prompts
- end-to-end delivery and retry behavior for operator WhatsApp notifications against a live Meta account
- confidence calibration and product-quality targets measured with consented real-user pilot outcomes
- staffed operator coverage, response-time targets, and authorized support procedures

Local verification includes PostgreSQL and Redis readiness, outbox recovery, operator query/escalation integration tests, channel identity/webhook tests, follow-up-limit behavior, and a TypeScript build. A synthetic live model request returned a response; one synthetic Tavily search succeeded; and a tagged synthetic `llm` run was retrieved from LangSmith. One exact-output LLM probe did not follow its requested response, so structured-output reliability is explicitly not verified. Automated channel-delivery tests use injected senders; they do not demonstrate delivery to a real user or operator.

There is no separate staging deployment connected to this workspace. WhatsApp, Daraja, and full end-to-end graph checks require configured staging credentials and test recipients.

### Live verification and pilot checklist

Run this checklist in staging with test accounts and record pass/fail, environment, timestamp, and sanitized evidence. Never put credentials or personal user content in the evidence.

1. **WhatsApp ingress/egress:** verify the Meta challenge, a valid signature, rejection of an invalid signature, duplicate external message suppression, outbound delivery, and operator notification to `OPERATOR_WHATSAPP_PHONE`. Force a temporary send failure, confirm retries/outbox state, then confirm recovery. Ensure the operator number is eligible for the message under Meta's current template/session rules.
2. **Telegram:** verify own-contact linking, rejection/ignoring of group and unlinked messages, duplicate update suppression, private user delivery on the active channel, operator pairing, and Telegram-preferred operator alerts.
3. **LLM provider:** run representative Intake, Skeptic, Ground, and Close calls; verify structured output, invalid-output rejection, user-owned request for a source when public evidence is unavailable, and operator handoff only for authorized organizational action without leaking secrets or user data into logs.
4. **Tavily:** a single synthetic search succeeded locally; in staging verify graph-persisted source URL/title/finding and the no-usable-evidence request for an authoritative source or identifying details from the user.
5. **PostgreSQL and Redis:** local readiness, migration, and outbox recovery checks pass. In staging verify worker start/restart, delayed follow-up execution, duplicate job handling, transient database/Redis failures, and outbox recovery without duplicated business actions.
6. **Operator Desk:** verify token-protected queue/metrics/outcome endpoints, internal note visibility, user-message delivery and transcript logging, resolution behavior, duplicate actions, and that a failed delivery leaves the case open.
7. **M-Pesa sandbox:** verify STK initiation and callback success/failure, then replay an identical callback and confirm no duplicate payment or user-visible effect.
8. **LangSmith:** a tagged synthetic LLM run was retrieved from the configured project. In staging verify a sanitized full graph trace contains tool/human transitions; confirm tracing can be disabled and failures are observable.
9. **Consent-based pilot:** use a small opt-in cohort with human oversight. Review decision completion/abandonment, recommendation and evidence coverage, handoff wait/response, user return, user-reported outcomes, and low-confidence cases. Treat the confidence value as support-strength, not a probability of success; compare it with independent reviewer assessments before proposing any calibration or launch threshold.

No arbitrary product pass threshold is encoded. Agree thresholds with product owners after a baseline pilot; the dashboard currently reports descriptive measures, not a launch decision.

## 15. Production configuration and deployment gate

At `NODE_ENV=production`, API and worker startup validate database, Redis, WhatsApp, operator notification channel, Tavily, and at least one model provider configuration. A WhatsApp operator number or Telegram operator setup is required; the internal operator token must be at least 32 characters. If payments are enabled, Daraja settings must be complete and the sandbox base URL is rejected. Configuration errors list missing variable names only, never values.

The service adds anti-framing, MIME-sniffing, referrer, and browser-permission headers; authenticated operator responses use `Cache-Control: no-store`, and operator-token comparison is constant-time. Public production ingress must enforce HTTPS; the service emits HSTS but does not terminate TLS. No deployment platform or infrastructure-as-code is present in this repository, so secret-manager provisioning, network policy, TLS configuration, process supervision, and monitoring must be completed in the target hosting environment.

Operator escalation resolution now sends the user-facing resolution message before marking the case resolved, records separate internal and outbound activity, and reopens the thread/decision record. A failed send leaves the escalation open. Production acceptance still requires validating this lifecycle through the deployed API and operator workflow.

## Database migration note

The Prisma schema is the source of truth. The recent channel changes include additive migrations for Telegram channel identities and Telegram operator pairing, in addition to earlier migrations for recommendation/closure timestamps, user ownership on agents, operator notification outbox records, and a backfill from existing closed threads to resolved decision records. Apply all pending migrations with the normal deployment process before running the updated application.
