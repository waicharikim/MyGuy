# Shauri Product Blueprint

## 1. Product definition

Shauri is a WhatsApp-based decision-support assistant for personal and operational decisions.

Its job is not to pretend certainty. Its job is to:

- structure the decision
- clarify the user goal
- challenge assumptions
- identify missing facts
- gather evidence
- recommend a path
- escalate to a human when required
- preserve a durable decision record

This is intentionally a bounded product. It is not a general-purpose chatbot.

## 2. Product promise

The user comes to Shauri with a real problem and gets a structured reasoning experience that is:

- calm and clear
- evidence-aware
- explicit about uncertainty
- capable of human escalation
- able to preserve context across a decision matter

## 3. User types

### Primary user

A person making a real-world choice that matters.

Examples:

- should I take a job?
- should I save, invest, or borrow?
- should I start a project or wait?
- what is the best next step in a difficult situation?

### Operator / human authority

A person who can answer a missing fact or resolve a high-risk decision.

Examples:

- team lead
- manager
- field officer
- trusted expert
- support human

## 4. Core user journey

### A. Matter creation

The user sends a message describing a decision or a problem.

The system:

- identifies the decision matter
- resolves the thread ownership
- creates or resumes the thread
- begins the intake pass

### B. Clarify the decision

The system asks only essential questions to determine:

- what is being decided
- what is already known
- what is missing
- what matters most to the user

### C. Challenge assumptions

The skeptic pass identifies:

- the likely leaning
- the strongest assumptions
- risks
- conditions that could change the decision

### D. Ground the decision

The grounding pass looks for external evidence and persists it.

If evidence cannot be found, the system asks for human authority or local verification.

### E. Recommendation and close

The close pass produces a recommendation in plain language.

The recommendation must include:

- what the user should consider next
- what the main trade-offs are
- whether a human should be involved
- whether the matter is ready to close

### F. Decision confirmation

When the decision is settled, the user confirms closure.

This gives the product a clear end state and preserves a durable record.

## 5. Required product contract

Every decision matter must have a normalized decision record.

### Required fields

- `matterId`
- `userId`
- `status` (`OPEN`, `AWAITING_HUMAN`, `RESOLVED`, `ESCALATED`)
- `decisionSummary`
- `goal`
- `preferredOption`
- `confidence`
- `risks`
- `evidenceRefs`
- `humanInputs`
- `createdAt`
- `updatedAt`
- `closedAt`

### Required output semantics

The close pass should not simply output a vague sentence. It should produce one of the following valid states:

1. `resolved`
   - a clear recommendation exists
   - user can confirm closure

2. `awaiting_human`
   - critical missing fact or authority is required

3. `escalated`
   - the matter is high-risk or blocked by a hard boundary

4. `open`
   - the matter still needs a key fact or next step

## 6. Recommended product behavior rules

### Rule 1: do not pretend certainty

If evidence is weak, say so.

### Rule 2: ask only for essential facts

Do not load the user with low-value questions.

### Rule 3: keep a durable decision audit trail

Every important fact, assumption, and source should be stored.

### Rule 4: escalate when human authority is required

This is a safety boundary and should be explicit.

### Rule 5: preserve context across the matter

The user should not have to re-explain the matter every time.

### Rule 6: user owns the final decision

The system helps reason, but does not replace the user’s agency.

## 7. Human workflow blueprint

### Human query needs a structured brief

When a human is needed, create a brief containing:

- short matter description
- question being asked
- relevant known facts
- questionable assumptions
- why the answer matters
- user context
- required action or deadline

### Operator use case

The operator should be able to answer with a single action:

- provide fact
- confirm recommendation
- resolve the matter
- redirect to another authority

### Operator follow-up

After the operator responds, the system should:

- store the new fact
- mark the human query answered
- resume the exact graph pass that needed the fact
- generate a fresh recommendation or next step

## 8. Trust and transparency layer

The product should make the following visible:

- what it already knows
- what it is still uncertain about
- which facts were grounded internally vs externally
- which facts came from humans and which came from external sources
- why it is asking for more information

There should be a clear difference between:

- user-provided facts
- system-known facts
- operator-provided facts
- external grounded facts

This helps avoid false confidence.

## 9. Outcome loop and learning

The product should go beyond one-message decisions and become a learning loop.

### Required learning signals

- did the user close the matter?
- did they ask for help again on a related topic?
- did the recommendation help them act?
- what happened after the follow-up: successful, partly successful, unsuccessful, no action, or still unclear
- did the human answer resolve the uncertainty?
- did the matter end in escalation or closure?

### Profile learning

The user profile should store:

- recurring concerns
- values
- decision tendencies
- patterns of risk
- historical decisions

This should improve the relevance of future interactions.

## 10. Product metrics

The product should be measured on quality and usability, not only technical uptime.

### Core metrics

- decision completion rate
- percentage of matters with a recommendation
- percentage of matters resolved without dead ends
- human escalation rate
- evidence rate
- average time to recommendation
- user return rate
- close confirmation rate

### Quality metrics

- matters with low-confidence final decisions
- matters requiring re-asking the same question
- matters that stall without an answer
- user drop-off after a human handoff

## 11. Recommended roadmap

### Phase 1: product contract

- define decision record schema
- enforce status transitions
- add explicit recommendation + confidence metadata
- define final close confirmation flow

### Phase 2: user progression

- standardize state labels
- make progress visible to the user
- reduce ambiguous closes and unclear restarts

### Phase 3: trust and audit

- persist evidence references in decision records
- present visible provenance for each conclusion
- support operator review summaries

### Phase 4: human workflow

- add operator inbox
- add structured brief generation
- ensure answer resume is deterministic and visible

### Phase 5: learning loop

- track outcomes and profile evolution
- store user outcome reports separately from operator classification
- improve context quality over time
- derive recurring decision patterns

## 12. Product guardrails

The project should maintain these guardrails:

- do not claim certainty when evidence is insufficient
- do not ask the user for a fact that the system already knows
- do not force a decision past a valid human authority boundary
- do not hide uncertainty in the final recommendation
- do not treat a successful chat as a successful decision

## 13. Final product framing

Shauri should be positioned as a structured decision-support product for real-life choices, not as a generic conversational bot.

This framing aligns with the architecture and closes the product gap: the system is no longer just an assistant; it becomes a decision workflow that is transparent, evidence-aware, and safe to use.
