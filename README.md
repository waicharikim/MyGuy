# Shauri

Shauri is a persistent decision-support engine. It is not a generic chatbot and not yet a full personal assistant.

## Runtime architecture

```text
WhatsApp
  -> signature verification
  -> inbound BullMQ queue
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
  -> WhatsApp
```

## Stack

- TypeScript / NestJS
- PostgreSQL / Prisma
- LangGraph / LangChain
- BullMQ / Redis
- WhatsApp Cloud API
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
- `INTERNAL_OPERATOR_TOKEN` with at least 32 characters
- `OPERATOR_WHATSAPP_PHONE`

Keep secrets in the deployment secret manager; never put live values in `.env` committed to source control, logs, images, or support tickets. Terminate HTTPS at the public ingress/load balancer and do not expose the Node port directly. The app sets HSTS in production; this assumes HTTPS is correctly enforced at the edge.

Build with `npm run build`, then run the API (`npm start`) and worker (`npm run start:worker:prod`) as separately supervised processes. For local development, use `npm run start:dev` and `npm run start:worker`. Apply committed Prisma migrations before deploying the new application version. Configure readiness/alerts for both processes, PostgreSQL, Redis, and outbound WhatsApp delivery. Production payment mode (`REQUIRE_PAYMENT=true`) additionally requires Daraja credentials and callback configuration, and rejects the sandbox base URL; validate live payment activation separately.

## Human operations

Operator data APIs are protected with `x-operator-token`:

- `GET /internal/human/dashboard` — operator UI for queue, outcomes, and quality metrics
- `GET /internal/human/queue` — open operator queries and escalations with decision context
- `GET /internal/human/outcomes` — user-reported outcomes awaiting operator classification
- `GET /internal/human/metrics` — all-time decision and reviewed-outcome quality metrics

The dashboard page itself is public but contains no operator data; it prompts for a token before calling the protected APIs.
- `POST /internal/human/decisions/:threadId/outcome` — classify a decision outcome
- `POST /internal/human/queries/:id/answer`
- `POST /internal/human/escalations/:id/resolve`

The queue returns each handoff's question/reason, user contact and profile summary, known facts, outstanding questions, decision record, and available grounding evidence.

Shauri replies include a concise decision status, such as waiting for user input, waiting for human verification, ready to close, referred to a human, or settled.

After a scheduled follow-up, the user's response is stored verbatim as an unclassified outcome report. Operators can review reports and classify them as `SUCCESSFUL`, `PARTIAL`, `UNSUCCESSFUL`, `NO_ACTION`, or `UNCLEAR`; the original user report and operator classification notes are retained separately.

The metrics endpoint is aggregate-only. Its successful-action rate denominator includes reviewed `SUCCESSFUL`, `PARTIAL`, and `UNSUCCESSFUL` outcomes; it excludes `NO_ACTION` and `UNCLEAR`. Rates are `null` when their denominator is zero.

The dashboard asks for the operator token and retains it only in the current browser tab's session storage. The APIs remain token-protected; the dashboard does not embed an operator credential.

Set `OPERATOR_WHATSAPP_PHONE` to the operator's WhatsApp number to receive queued human-query and escalation alerts. The worker retries delivery and retains pending notification records in PostgreSQL for recovery if Redis or WhatsApp is unavailable. Run `npm run start:worker` alongside the API. Configure the operator number to be eligible for business-initiated messages under Meta's WhatsApp rules; failed sends remain pending and are retried.

The closing pass requires a validated recommendation contract: a recommendation and bounded confidence estimate are stored together, with assumptions, unresolved risks, and unanswered material questions kept distinct. If the agent cannot justify a recommendation, both recommendation and confidence are left unset; invalid or contradictory model output fails instead of being replaced with synthetic defaults.

Decision records retain `recommendedAt` and `closedAt`; closure is recorded only after explicit user confirmation. The operator metrics include recommendation/evidence coverage, confirmed closure among records with recommendations, low-confidence recommendation counts (<50%, descriptive only), time to recommendation/resolution, stale open decisions, operator handoff response/resolution rates, and a returning-user proxy (at least two inbound WhatsApp message-days among users with any inbound WhatsApp message). Operator-query response rate uses all operator queries (open, answered, or cancelled) as its denominator. Rates are null when their denominator is zero.

Agent interactions are scoped to the requester's own thread and require an explicit responder capability and permission grant. An answer must name the interaction's addressed responder; request and response messages are auditable and a request cannot be answered twice. Cross-user sharing still requires an explicit permission and should be limited to the requested payload. This protocol foundation is not yet exposed through an externally authenticated agent-network gateway.

An inbound reply to an outcome follow-up is intercepted before intent routing and the decision graph. It is stored with an acknowledgement and completes that turn. If multiple follow-ups are pending, Shauri asks the user to select the relevant matter before recording the outcome.

## Architecture status

See `docs/IMPLEMENTATION_STATUS.md` for the documentation-to-code implementation map and the remaining environment-dependent verification.

## Product documentation

To close the remaining product gap and define the user-facing operating model, see:

- `docs/PRODUCT_GAP_ANALYSIS.md` — product gap analysis and gap closure plan
- `docs/PRODUCT_BLUEPRINT.md` — product blueprint, decision contract, and roadmap
