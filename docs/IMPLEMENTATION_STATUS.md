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

The closing pass enforces a typed decision contract for user-facing next action, optional recommendation, bounded confidence, assumptions, unresolved risks, unanswered material questions, and mutually exclusive resolved/escalated/human-query outcomes. Open questions are persisted separately from assumptions and exposed in operator handoffs. A recommendation is shown with its confidence estimate; if no recommendation is justified, recommendation and confidence remain null.

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
- operator dashboard for human handoffs, outcome review, and quality metrics
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

Operator-channel human queries and escalations create durable PostgreSQL notification records and enqueue WhatsApp alerts to `OPERATOR_WHATSAPP_PHONE`. The worker retries delivery and scans pending records after restart or queue outages. Live WhatsApp delivery still requires valid credentials and a recipient eligible to receive business-initiated messages.

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

The persistence model and permission-checked interaction service now exist. Agents can be associated with a user, interactions cannot attach a thread outside the requester's ownership, answers must identify the addressed responder, and request/response messages are retained. A controlled two-agent integration test covers explicit grants and denied cross-user thread context. This is intentionally a protocol foundation rather than an autonomous multi-agent swarm; an externally authenticated agent-network gateway is still future work.

## 13. Product quality metrics

The operator metrics report all-time recommendation and evidence coverage, recommendation-confirmation rate (resolved matters with recommendations divided by matters with recommendations), low-confidence recommendation count (<50%), average recommendation/resolution time, decisions open or awaiting a human for more than seven days, operator-query response rate (answered divided by all operator queries), escalation resolution rate, and returning-user proxy (users with inbound WhatsApp messages on at least two distinct days, divided by users with any inbound WhatsApp message). The endpoint preserves outcome metrics and returns null for ratios/timing without a denominator. These are operational indicators; they do not establish recommendation quality or calibrated confidence.

## 14. What remains environment-dependent

These cannot be honestly marked as production-verified inside this environment:

- real Meta WhatsApp webhook signature verification against a live app
- real WhatsApp Cloud API delivery
- real Tavily responses
- real LLM structured-output behavior
- real Safaricom Daraja callbacks/STK prompts
- PostgreSQL/Redis integration tests
- LangSmith traces against a live account
- end-to-end delivery and retry behavior for operator WhatsApp notifications against a live Meta account
- confidence calibration and product-quality targets measured with consented real-user pilot outcomes

The code is designed for these integrations, but credentials and external services are required for live verification.

### Live verification and pilot checklist

Run this checklist in staging with test accounts and record pass/fail, environment, timestamp, and sanitized evidence. Never put credentials or personal user content in the evidence.

1. **WhatsApp ingress/egress:** verify the Meta challenge, a valid signature, rejection of an invalid signature, duplicate external message suppression, outbound delivery, and operator notification to `OPERATOR_WHATSAPP_PHONE`. Force a temporary send failure, confirm retries/outbox state, then confirm recovery. Ensure the operator number is eligible for the message under Meta's current template/session rules.
2. **LLM provider:** run representative Intake, Skeptic, Ground, and Close calls; verify structured output, invalid-output rejection, and human-query fallback without leaking secrets or user data into logs.
3. **Tavily:** verify a real query, persisted source URL/title/finding, and the no-usable-evidence fallback to a human query.
4. **PostgreSQL and Redis:** verify worker start/restart, delayed follow-up execution, duplicate job handling, transient database/Redis failures, and outbox recovery without duplicated business actions.
5. **M-Pesa sandbox:** verify STK initiation and callback success/failure, then replay an identical callback and confirm no duplicate payment or user-visible effect.
6. **LangSmith:** verify a sanitized trace contains the graph run and relevant tool/human transitions; confirm tracing can be disabled and failures are observable.
7. **Consent-based pilot:** use a small opt-in cohort with human oversight. Review decision completion/abandonment, recommendation and evidence coverage, handoff wait/response, user return, user-reported outcomes, and low-confidence cases. Treat the confidence value as support-strength, not a probability of success; compare it with independent reviewer assessments before proposing any calibration or launch threshold.

No arbitrary product pass threshold is encoded. Agree thresholds with product owners after a baseline pilot; the dashboard currently reports descriptive measures, not a launch decision.

## Database migration note

The Prisma schema is the source of truth. The changes in this revision include additive migrations for recommendation/closure timestamps, user ownership on agents, operator notification outbox records, and a backfill from existing closed threads to resolved decision records. Apply the pending migrations with the normal deployment process before running the updated application.
