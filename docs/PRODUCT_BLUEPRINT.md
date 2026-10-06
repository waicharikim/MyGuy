# Shauri Product Blueprint

## 1. Product definition

Shauri is a bounded, evidence-aware decision-support service delivered through
WhatsApp and optional Telegram private chats. It helps a person structure a
real-world decision, clarify what matters, challenge assumptions, research
public facts, and identify a responsible next step. The user owns the
decision.

Shauri is not a generic chatbot, a substitute for professional advice, or an
authorized representative of unrelated employers, regulators, or other
organizations.

## 2. Product promise and guardrails

Shauri should:

- make the decision and user goal explicit
- ask for essential missing information without repeatedly asking what is
  already known
- distinguish user reports, application state, public evidence, and human
  input
- show recommendations with assumptions, risks, open questions, and bounded
  confidence when a recommendation is justified
- state uncertainty rather than inventing facts
- use public research for public claims and request a source from the user if
  research is insufficient
- route an operator task only when an authorized Shauri operator can act or
  provide organizational information
- preserve the user's agency and require confirmation before closing a
  decision

The confidence estimate describes support for the recommendation; it is not a
calibrated probability that the recommendation will succeed.

## 3. User and operator roles

### User

A person making a personal or operational choice. They provide their goals,
preferences, lived experience, and private documents or confirmation they can
obtain.

### Operator

An authenticated Shauri staff member with defined service responsibilities
and, where applicable, approved system access. The operator can supply
organizational knowledge, investigate a service issue, or perform an
authorized action. The operator must not guess or claim authority over an
unrelated third party.

## 4. Decision journey

1. **Start or resume a matter.** Shauri resolves the conversation to the
   appropriate open decision thread.
2. **Understand the choice.** Intake captures the goal, known facts, open
   questions, constraints, and user preferences.
3. **Challenge assumptions.** The skeptic pass identifies risks, alternatives,
   and conditions that could change the decision.
4. **Ground public claims.** The ground pass uses Tavily and retains available
   source provenance. If it cannot find usable evidence, Shauri asks the user
   for an authoritative link, document, or identifying details rather than
   assigning public research to an operator.
5. **Recommend or ask for the next input.** The close pass creates a validated
   decision record. If it is not ready, Shauri asks the user or opens an
   operator query according to the information authority model.
6. **Confirm closure.** A resolved suggestion asks the user to confirm before
   the matter is marked closed.
7. **Review outcomes.** A follow-up may collect what happened. The report is
   preserved verbatim and kept separate from operator classification.

## 5. Decision record contract

Each decision record may contain:

- matter and decision summary
- user goal
- status: `OPEN`, `AWAITING_HUMAN`, `RESOLVED`, or `ESCALATED`
- recommended option, when justified
- bounded confidence estimate, present with a recommendation
- risks, assumptions, and unresolved questions as distinct fields
- evidence references and human inputs
- recommendation, outcome, and closure timestamps

Not every matter can responsibly produce a recommendation. In that case the
recommendation and confidence remain unset, and the next missing input or
action should be explicit.

## 6. Information authority and human operations

| Need | Next owner |
|---|---|
| User's intention, preference, experience, or private document | User |
| State already held by Shauri | System/application |
| Publicly verifiable fact | External research |
| Shauri organizational fact, service issue, or authorized action | Operator |

See `INFORMATION_AUTHORITY.md` for routing details and
`OPERATOR_WORKFLOW.md` for the operator queue, case work log, direct user
updates, and resolution procedure.

Operator-owned human queries are answered in the authenticated Operator Desk;
the answer is sent to the user and resumes the saved graph pass. Escalations
have a separate workflow for internal notes, user updates via the user's
active channel, and resolution with a user-facing message. A failed user
message delivery leaves the escalation open.

Telegram accepts linked users in private chats only. Group messages are
ignored; there is no group posting or content-redaction feature.

## 7. Trust, privacy, and auditability

- Preserve conversation transcripts and decision context for authenticated
  operator review.
- Store grounding sources and human answers with their provenance.
- Separate internal operator notes from messages sent to the user.
- Authenticate operator data APIs with `INTERNAL_OPERATOR_TOKEN`; do not
  embed the token in the dashboard.
- Send user-facing operator messages through the user's active channel.
- Keep secrets out of source control, logs, and documentation.
- Avoid presenting the operator dashboard over an unstable development tunnel
  as a production service.

## 8. Outcome loop and measurement

The product tracks decision statuses, recommendations, evidence, reported
outcomes, operator handoffs, and descriptive aggregate metrics. Operators may
classify unclear reports; the original user report remains separately
available.

Current metrics are operational indicators, not proof of product efficacy,
causal impact, or calibrated confidence. Validate definitions and baselines
with consented pilot data before using them as launch gates.

## 9. Current state and remaining work

Implemented foundations include WhatsApp and optional Telegram private
channels, durable graph state, Tavily grounding, decision records, user and
operator human-query lifecycles, an authenticated Operator Desk, auditable
escalation communications, bounded follow-ups, and outcome review.

Remaining validation includes live provider behavior, WhatsApp and Daraja
staging tests, real retry/worker-restart scenarios, multilingual user testing,
privacy/retention policy, operator service-level expectations, and
consented pilot assessment of decision quality.

The implementation checklist and environment-dependent verification details
are maintained in `IMPLEMENTATION_STATUS.md`.
