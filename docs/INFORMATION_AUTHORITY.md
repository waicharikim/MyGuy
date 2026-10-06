# Shauri Information Authority Model

## Purpose

Shauri distinguishes what information is missing from who can legitimately
provide it. The graph identifies a need; source policy and the human-routing
step determine whether the next action belongs to the user, application,
external research, or an authorized operator.

## Source classes

| Source | Appropriate information | Examples |
|---|---|---|
| `USER` | Personal facts, preferences, lived experience, and private details the user can provide or obtain | Goals, constraints, what happened, the start date in the user's offer letter |
| `SYSTEM` | State and policy already held by Shauri or its application | Account/payment state, stored approved policy |
| `EXTERNAL` | Public facts suitable for research and source verification | Public registration, published rules, public product information |
| `OPERATOR` | Organizational facts or actions an authorized Shauri operator can actually provide or perform | Support-console investigation, service availability, internal procedure, an approved exception |

An operator is not a generic substitute for the internet, the user, or an
unrelated third party. Do not route a private employer-controlled fact to an
operator unless that operator has explicit authority and practical access to
verify it.

## Routing behavior

- The graph assigns explicit fact types such as `USER_PREFERENCE`,
  `SYSTEM_STATE`, `ORGANIZATIONAL_KNOWLEDGE`, `HUMAN_VERIFICATION`, and
  `EXTERNAL_FACT`.
- Deterministic source mappings cover user, system, organizational, and
  external facts.
- Human-verification needs use the human authority router to distinguish a
  user who must obtain/provide the information from an authorized operator
  who can act for Shauri.
- Public claims are researched through Tavily when configured. If search is
  unavailable or returns no usable evidence, Shauri asks the user for
  identifying details or an authoritative source; it does not create an
  operator task solely to perform public research.
- When a user-owned query is open, the next user reply can answer it and
  resume the saved graph pass.
- An operator-owned query is a hard pause. An ordinary user message cannot
  answer it; the operator must use the authenticated Operator Desk.

## Provenance and privacy

Human answers are retained in the human-query lifecycle and added to thread
knowledge with human-provided provenance. Public grounding evidence stores
its claim, search query, source URL/title, finding, and retrieval metadata.
User messages and operator-originated user messages are recorded in the
thread transcript. Operator notes are kept in escalation activity and are
not sent to the user.

Telegram user interactions are private-chat-only. Group messages are
intentionally ignored; the bot does not currently implement per-field
redaction or a group-sharing mode.

## Human-query routing implementation

- Source mapping and graph routing: `src/agent/graph.ts`
- Authority classification: `src/agent/human-routing.ts`
- User/operator answer lifecycle: `src/agent/human-query.ts`
- External evidence: `GroundingEvidence` and Tavily in `src/agent/graph.ts`
- Operator workflow: `docs/OPERATOR_WORKFLOW.md`

The model's routing classification is not itself proof that a fact is
verified. Operators must only provide facts they can verify or actions they
are authorized to perform.
