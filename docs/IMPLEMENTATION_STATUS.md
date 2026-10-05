# Shauri v0.2 Implementation Status

This addendum maps the documentation pack to the implementation delivered in this scaffold revision.

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

`WhatsApp -> HMAC verification -> BullMQ -> idempotent processing -> thread resolution -> routing -> Shauri graph -> persisted reply -> WhatsApp`

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

## 7. Grounding

Implemented:
- claim extraction
- search-query derivation
- Tavily search
- source normalization
- `GroundingEvidence` persistence
- fallback to Human Query when grounding is unavailable or produces no usable evidence

## 8. Human Query / Handoff

Implemented:
- durable Human Query records
- pause/resume state
- operator answer endpoint
- authenticated operator queue with decision, profile, and evidence context
- user-reported post-follow-up outcomes, preserved for operator classification
- inbound outcome replies acknowledged and short-circuited before intent routing/graph execution
- explicit numbered matter selection when multiple outcome follow-ups are pending
- authenticated outcome review and classification endpoints
- aggregate decision-quality metrics endpoint with explicit denominator semantics
- knowledge-candidate promotion from human answers
- durable Escalation records
- operator resolution endpoint

The operator endpoints are protected by `INTERNAL_OPERATOR_TOKEN`.

## 9. Follow-up reliability

Implemented:
- separate BullMQ worker
- idempotency key
- processing/sent/cancelled states
- retryable worker failures
- maximum follow-up guardrail
- explicit outcome request marker and idempotent outcome capture
- actual WhatsApp delivery

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

The persistence model and permission-checked interaction service now exist. This is intentionally a protocol foundation rather than an autonomous multi-agent swarm.

## 13. What remains environment-dependent

These cannot be honestly marked as production-verified inside this environment:

- real Meta WhatsApp webhook signature verification against a live app
- real WhatsApp Cloud API delivery
- real Tavily responses
- real LLM structured-output behavior
- real Safaricom Daraja callbacks/STK prompts
- PostgreSQL/Redis integration tests
- LangSmith traces against a live account

The code is designed for these integrations, but credentials and external services are required for live verification.

## Database migration note

The Prisma schema is the source of truth. The supplied migration directory is intentionally a fresh-database foundation marker rather than a destructive data-conversion migration. For an existing development database, run `npx prisma migrate dev` and review Prisma's generated migration before applying it. Do not apply a blind enum/string conversion to production data.
