# Product Gap Analysis

## Current assessment

Shauri has moved beyond a reasoning prototype: it has durable decision
records, a multi-pass graph, public evidence retrieval, WhatsApp and optional
Telegram private messaging, follow-ups, outcomes, and an authenticated
operator desk. The remaining product gap is operational trust and
real-world validation, not the absence of a decision pipeline.

This document distinguishes implemented capabilities from product and
deployment work that still requires decisions or evidence.

## Implemented capabilities

- A structured decision record with status, goal, recommendation, confidence,
  risks, assumptions, open questions, evidence references, and outcome data.
- Intake, skeptic, ground, and close graph passes with persisted checkpoints.
- Tavily grounding for public claims and stored source evidence.
- Information authority routing: public facts are researched; private
  third-party details are requested from the user; operators are reserved for
  organizational tasks they can actually perform.
- User-owned query pause/resume and operator-owned query pause/resume.
- Operator Desk queue, transcript, outcomes, aggregate metrics, and
  escalation workflow with internal notes, user updates, and resolution.
- Channel-aware user messaging over WhatsApp and optional Telegram private
  chat.
- Follow-up cap that stops reminders without turning user silence into an
  operator escalation.

The product behavior and implementation details are in
`PRODUCT_BLUEPRINT.md`, `INFORMATION_AUTHORITY.md`, and
`OPERATOR_WORKFLOW.md`.

## Remaining product gaps

### P0 — Validate decision quality with real users

The confidence estimate is not calibrated and aggregate dashboard metrics do
not prove that decisions improved. Run a consent-based pilot with human
oversight. Define outcome review, safety escalation criteria, data-retention
limits, and product acceptance thresholds before broad launch.

### P1 — Operational ownership and service levels

The operator workflow provides tools but does not yet define staffing,
assignment/ownership, response deadlines, coverage hours, emergency routing,
or what to do when a case belongs to an external authority. Define those
procedures before relying on timely human response.

### P2 — Production channel and payment verification

Local and synthetic checks are not substitutes for end-to-end staging.
Validate WhatsApp, Telegram, Tavily, Redis worker recovery, and M-Pesa sandbox
callbacks using test accounts and sanitized evidence. Configure stable
hosting, HTTPS, secret management, monitoring, retention, and backups.

### P3 — User experience and accessibility

The user-facing conversation and Operator Desk need usability testing,
including mobile layouts, localization, ambiguous close confirmation, user
consent, communication preferences, and understandable evidence provenance.

### P4 — Safe learning and profile lifecycle

Define user access/export/deletion and retention behavior for profiles,
transcripts, decision evidence, operator notes, and outcomes. Establish how
profile learning is reviewed and corrected; do not treat model-generated
connections or an operator note as verified truth.

### P5 — Resilience and audit hardening

Add operational ownership/assignment and, if multiple operators are expected,
case locking or concurrency protections. Review delivery idempotency for
operator-triggered messages, audit retention, alert retries, and recovery from
partial provider/database failures.

## Product success measures

Use descriptive measures such as:

- decision completion and abandonment
- recommendation and evidence coverage
- unresolved material questions
- time to recommendation and resolution
- user-reported outcomes and separately classified outcomes
- operator response and escalation-resolution time
- user return and user-reported usefulness
- unsupported-claim and correction rate

State each denominator and the intended interpretation. Do not use these
metrics as quality guarantees until validated against reviewed pilot data.

## Recommended next steps

1. Confirm the support model, operator authority, coverage, and service-level
   expectations.
2. Complete a privacy and data-retention review for all user and operator
   records.
3. Run staged provider and failure-recovery checks using test identities.
4. Conduct a small consented pilot with human review and a documented
   incident/correction path.
5. Use pilot evidence to prioritize UX, safety, and measurement changes.

There is no basis in this repository alone to claim production readiness,
calibrated recommendations, or successful real-user outcomes.
