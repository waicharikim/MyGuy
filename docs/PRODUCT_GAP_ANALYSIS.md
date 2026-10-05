# Product Gap Analysis and Gap Closure Plan

## Executive summary

Shauri has a strong technical foundation: durable thread state, graph-based reasoning, human-query pause/resume mechanics, follow-up tooling, external grounding, and operator handoff patterns. The main product gap is not technical feasibility; it is product completeness.

The system currently behaves like a robust reasoning engine with operational safeguards, but it does not yet define a durable, user-trustworthy product contract for decision-making.

This gap appears in five places:

1. The system does not yet define a clear decision output contract.
2. The user journey is not yet a full product flow from input to settlement.
3. The platform does not yet provide a strong trust and audit story.
4. Human handoff is implemented technically but not yet productized as a guided workflow.
5. There is no full business/value loop that turns a decision into a repeatable product outcome.

The goal of this document is to close those gaps by defining the missing product requirements and a roadmap.

## Current state

The following are already implemented in the codebase:

- durable thread state
- human query lifecycle
- operator escalation lifecycle
- fact grounding and evidence persistence
- task/note/follow-up tools
- external interactions via WhatsApp, Redis, Tavily, and M-Pesa
- graph steps covering intake, skeptic, ground, and close

These are a strong operational foundation. The missing layer is product clarity.

## Gap 1: there is no decision output contract

### Problem

The engine can ask questions and generate responses, but the project does not yet specify what a final, trusted decision looks like.

At the moment, the output from the close pass is a natural-language string, but there is no product-level requirement for:

- recommended option
- confidence level
- assumptions
- key trade-offs
- evidence used
- outstanding uncertainties
- whether the decision is final or provisional
- whether the matter is closed, escalated, or needs more information

### Why it matters

Without a standard decision record, the product cannot reliably communicate what it knows, what it does not know, or when it should stop.

### Product requirement

Every decision matter must produce a compact, auditable decision artifact with:

- matter summary
- user goal
- decision options considered
- best current option
- rationale
- confidence level
- evidence references
- unresolved risks
- decision state: open, resolved, escalated, or awaiting human input

### Gap closure plan

Add a formal decision contract and enforce it in the close pass:

- `decisionSummary` must be standardized
- `recommendedOption` must be explicit
- `confidence` must be set
- `status` must be one of: open, awaiting_human, resolved, escalated
- `evidence` must be linked to source records
- `riskFlags` must be captured when the matter remains uncertain

---

## Gap 2: the user journey is incomplete

### Problem

The technical flow is strong, but the product user flow is not defined end-to-end.

The code handles message routing and thread continuation, but it does not specify a full journey for:

- first-time onboarding
- matter creation
- clarifying the choice
- asking for evidence
- evaluating options
- confirming the final recommendation
- closing the matter

### Why it matters

A user may receive smart responses, but they will not feel guided or confident unless the system tells them what step they are in.

### Product requirement

Provide a product-grade decision journey with visible states such as:

- intake
- considering options
- checking risks
- gathering evidence
- recommendation ready
- confirmation pending
- resolved
- escalated

Each state must be visible in the chat and in persisted records.

### Gap closure plan

Define user-facing transitions and persist them:

- a matter starts with a clear decision prompt
- the agent asks only essential questions
- the user sees a compact progress summary
- the system communicates the current stage
- the user can answer or close the matter explicitly

---

## Gap 3: trust and auditability are not productized

### Problem

The architecture includes `GroundingEvidence`, `HumanQuery`, `GraphCheckpoint`, and `UserProfile`, which is a strong technical audit trail. But the end-user trust story is still weak.

The product does not yet explain:

- what was known when the recommendation was made
- what external facts were used
- what human inputs were relied on
- why a decision was considered safe or risky

### Why it matters

Users will not trust a decision engine unless it can explain and justify its work.

### Product requirement

Every decision record should support a simple audit trail:

- fact sources
- human authority inputs
- assumptions made
- risk flags
- final recommendation
- who or what triggered escalation

### Gap closure plan

Create an explicit decision ledger and surface it in the product UX and operator tools.

Recommended fields:

- `matterId`
- `decisionSummary`
- `contextSummary`
- `recommendedOption`
- `confidence`
- `evidenceUrls`
- `assumptions`
- `risks`
- `humanInputs`
- `status`
- `createdAt`
- `updatedAt`

---

## Gap 4: human handoff is implemented technically but not as a product workflow

### Problem

The system can open a HumanQuery and route it to operator or user input. That is technically valid. But the product still lacks a complete human-operational experience.

The current model does not clearly define:

- when a human should be involved
- what they are expected to answer
- the context they need
- how their answer feeds back into the decision engine
- how the user is updated after the handoff

### Why it matters

When a product relies on human authority, the handoff must be structured and low-friction.

### Product requirement

Define a dedicated operator workflow with human-readable context:

- reason for needing a human
- relevant facts already known
- specific question asked
- deadline or urgency indicator
- context for the final decision

### Gap closure plan

Add an operator-facing bundle for any human query:

- `matter`
- `question`
- `knownContext`
- `reason`
- `source`
- `decision status`
- `contact/user profile`
- `next action intended`

This should be surfaced both in the operator inbox and in the WhatsApp conversation when appropriate.

---

## Gap 5: the product does not yet have a business/value loop

### Problem

The code includes tasks, notes, follow-ups, and payment gating, but it does not yet make a clear product promise about long-term value.

There is no full loop such as:

- create decision
- gather decision inputs
- get recommendation
- take action
- revisit outcome
- improve future recommendations

### Why it matters

A product is not just a reasoning engine. It needs a loop that creates habit, trust, and measurable usefulness.

### Product requirement

Define the product loop:

1. identify a decision
2. gather relevant facts and constraints
3. challenge assumptions
4. ground the decision with evidence
5. recommend the next step
6. collect outcome data
7. update profile and future recommendations

### Gap closure plan

Create a persistent decision lifecycle with outcome tracking:

- past decisions
- key outcomes
- preferences learned
- recurring concerns
- decision quality indicators

This should feed back into the user profile and improve future interaction quality.

---

## Gap 6: product boundaries are still too vague

### Problem

The project is capable of many things but not clearly positioned in a single product lane.

Examples of unclear product scope:

- personal life decision coach
- investment or finance assistant
- community decision helper
- operational escalation assistant
- general WhatsApp bot

### Why it matters

Product scope affects trust, safety, and user expectation management.

### Product requirement

Choose a clear product primary use case and constrain the system accordingly.

Recommended choice for this project:

- a decision-support assistant for personal and operational decisions with human escalation and evidence grounding

This keeps the project aligned with the existing architecture and avoids drift into generic assistant territory.

### Gap closure plan

Document the product as a bounded decision-support system, not a free-form chatbot.

---

## Priority gaps to fix first

### P0: define the decision contract

This is the most important missing layer and the basis for product trust.

### P1: define the end-user journey and state labels

The user must understand what stage the system is in and what is expected next.

### P2: add decision auditability

This is essential for operator trust and product credibility.

### P3: productize operator workflow

Creates a repeatable human expertise layer.

### P4: connect outcome tracking and profile learning

Needed for ongoing usefulness beyond a single decision.

---

## Recommended product blueprint

### Product identity

Shauri is a WhatsApp-based decision-support assistant for high-stakes personal and operational choices. It helps users reason through options, identify missing facts, challenge assumptions, ground decisions in evidence, and escalate to a human when needed.

### Core promise

The product helps the user make a better decision without pretending certainty when evidence is weak.

### Core principles

- do not fabricate facts
- ask only for essential missing information
- require evidence for important claims
- escalate when the risk is high or the boundary is unclear
- keep a durable decision record
- avoid making the user feel trapped in a generic chatbot loop

### Success metrics

- decision completion rate
- user re-engagement rate
- percentage of matters resolved without escalation
- percentage of matters with recorded evidence
- time to user answer
- percentage of decisions with a clear recommendation
- percentage of closed matters with a final decision summary

### Key product requirements

- final answer should include recommendation + reasoning + confidence
- every matter should have a status
- every high-risk matter should route to a human workflow
- evidence should be accessible
- user profile should evolve based on completed decisions
- unresolved questions should be explicit and actionable

---

## Gap closure implementation plan

### Phase 1: product contract and trust layer

- define decision output schema
- enforce standard status fields
- add confidence and evidence metadata
- add matter summary and recommendation record

### Phase 2: user journey refinement

- add explicit states and labels in UX and message flows
- define close confirmation semantics
- define when a matter is ready to be considered settled

### Phase 3: operator workflow hardening

- add operator queue / inbox view
- add decision summary to escalation payload
- add operator resolution feedback to user thread

### Phase 4: learning and personalization

- store past decision outcomes
- learn recurring concerns and preference patterns
- improve future recommendation quality

### Phase 5: product validation

- track real-world use metrics
- identify which decisions are being resolved successfully
- remove gaps in high-friction flows

---

## Final assessment

The project is technically advanced and structurally solid. It is not missing the ability to reason or orchestrate; it is missing the product skeleton that makes the reasoning trustworthy, explainable, and valuable to users.

The product should be framed as a bounded, evidence-aware decision-support system with strong human safety boundaries, not as a free-form conversational assistant.

Once these product gaps are addressed, the project becomes substantially more credible as a real user-facing system rather than a technical prototype.
