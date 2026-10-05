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

Configure:

- `DATABASE_URL`
- Redis
- one LLM provider
- `TAVILY_API_KEY`
- WhatsApp Cloud API credentials
- `WHATSAPP_APP_SECRET`
- `INTERNAL_OPERATOR_TOKEN`
- Daraja credentials only if payments are enabled

## Human operations

Operator endpoints are protected with `x-operator-token`:

- `GET /internal/human/queue` — open operator queries and escalations with decision context
- `GET /internal/human/outcomes` — user-reported outcomes awaiting operator classification
- `GET /internal/human/metrics` — all-time decision and reviewed-outcome quality metrics
- `POST /internal/human/decisions/:threadId/outcome` — classify a decision outcome
- `POST /internal/human/queries/:id/answer`
- `POST /internal/human/escalations/:id/resolve`

The queue returns each handoff's question/reason, user contact and profile summary, known facts, outstanding questions, decision record, and available grounding evidence.

Shauri replies include a concise decision status, such as waiting for user input, waiting for human verification, ready to close, referred to a human, or settled.

After a scheduled follow-up, the user's response is stored verbatim as an unclassified outcome report. Operators can review reports and classify them as `SUCCESSFUL`, `PARTIAL`, `UNSUCCESSFUL`, `NO_ACTION`, or `UNCLEAR`; the original user report and operator classification notes are retained separately.

The metrics endpoint is aggregate-only. Its successful-action rate denominator includes reviewed `SUCCESSFUL`, `PARTIAL`, and `UNSUCCESSFUL` outcomes; it excludes `NO_ACTION` and `UNCLEAR`. Rates are `null` when their denominator is zero.

An inbound reply to an outcome follow-up is intercepted before intent routing and the decision graph. It is stored with an acknowledgement and completes that turn. If multiple follow-ups are pending, Shauri asks the user to select the relevant matter before recording the outcome.

## Architecture status

See `docs/IMPLEMENTATION_STATUS.md` for the documentation-to-code implementation map and the remaining environment-dependent verification.

## Product documentation

To close the remaining product gap and define the user-facing operating model, see:

- `docs/PRODUCT_GAP_ANALYSIS.md` — product gap analysis and gap closure plan
- `docs/PRODUCT_BLUEPRINT.md` — product blueprint, decision contract, and roadmap
