# Shauri Operator Workflow

## Purpose and boundaries

The Operator Desk is for work that an authenticated Shauri operator is
authorized and practically able to do: answer organizational questions,
investigate a service problem in approved systems, or perform a defined
support action.

It is not a general web-research queue. Public facts should be researched by
Shauri through Tavily; if evidence is insufficient, Shauri asks the user for
an authoritative source or identifying details. A private fact held by an
unrelated employer or other third party should normally be obtained by the
user. Operators must not guess, claim ungranted access, or represent
themselves as another organization.

## Access

Open `GET /internal/human/dashboard`. The static HTML login page is public,
but it contains no operator data. Enter `INTERNAL_OPERATOR_TOKEN`; the
browser retains it only in the current tab's session storage.

All data APIs require the `x-operator-token` header. Use HTTPS in a hosted
environment. A temporary ngrok URL is for local development only and may
change when the tunnel restarts.

## Queue types

### Human query

A human query asks for a specific missing fact or judgment. Review its matter,
question, reason, decision context, evidence, and transcript. Before
answering:

1. Verify that the question is within the operator's authority.
2. Verify the answer from an approved system, source, or responsible person.
3. Include how it was verified; never guess.
4. Use **Answer query** only when a useful verified answer is available.

The answer is sent to the user through their active channel, recorded as
human-provided input, and resumes Shauri's paused graph pass. If the answer
cannot be verified or the task is outside operator authority, do not invent
an answer; route the matter according to the support procedure.

### Escalation

An escalation is a case needing authorized service/operator intervention,
not merely an unanswered message. Review the case summary, reason, decision
record, transcript, and escalation work log.

Use the case actions in order as applicable:

1. **Record internal note** — log findings, actions, or a next step. This
   stays in the escalation work log and is not sent to the user.
2. **Send user update** — send a truthful status/update through the user's
   most recently active channel. The update is recorded in the escalation
   work log and thread transcript.
3. **Resolve and notify user** — enter an internal resolution note describing
   what was done and why the case is resolved, plus a separate message for the
   user. The user message is sent before the escalation is marked resolved.
   Successful resolution reopens the decision thread/record so the user may
   continue the decision.

Do not mark a case resolved while the underlying issue is still open. If
delivery of a user message fails, the error is surfaced and the escalation
remains open. Check the case before retrying to avoid sending duplicate
messages after uncertain provider responses.

## Activity and message visibility

- Internal notes are visible to authenticated operators in the escalation
  work log; they are not delivered to the user.
- User updates and resolution messages are delivered through the user's
  active WhatsApp or linked Telegram identity.
- User-facing operator messages appear in both escalation activity and the
  decision thread transcript.
- The transcript shows up to the latest 50 thread messages in chronological
  order. The escalation work log contains its case-specific actions.
- Operator alerts are notifications that a case exists; they do not mean the
  case has been investigated or resolved.

## Outcome review

The separate outcome-review section lists unclear user-reported results.
Review the original report and recommendation before classification. Keep
operator classification notes distinct from the user's verbatim report.
Classifications describe the observed outcome; they do not establish
causation or prove the recommendation was correct.

## API reference

All endpoints below require `x-operator-token`:

| Method and path | Action |
|---|---|
| `GET /internal/human/queue` | Open operator-owned queries and escalations |
| `POST /internal/human/queries/:id/answer` | Answer an operator-owned human query and resume Shauri |
| `POST /internal/human/escalations/:id/notes` | Add an internal note (`note`, non-empty, maximum 4,000 characters) |
| `POST /internal/human/escalations/:id/message` | Send a user update (`message`, non-empty, maximum 4,000 characters) |
| `POST /internal/human/escalations/:id/resolve` | Resolve using an internal `answer` note; optional `userMessage` is sent before resolution |
| `GET /internal/human/outcomes` | List outcome reports awaiting review |
| `POST /internal/human/decisions/:threadId/outcome` | Classify a reported decision outcome |
| `GET /internal/human/metrics` | Read aggregate decision and handoff metrics |

The dashboard's **Resolve and notify user** action requires both an internal
resolution note and a user-facing message. API clients may omit `userMessage`
when policy allows an internal-only resolution, but must not imply that a
user was notified when no message was sent.

## Relevant implementation

- Queue/context: `src/agent/operator-queue.ts`
- Escalation actions: `src/agent/operator-escalation.ts`
- Authenticated HTTP routes: `src/human.controller.ts`
- Dashboard: `src/operator-dashboard.ts`
- Channel-aware user delivery: `src/messaging/send-user-message.ts`
- Integration test: `npm run test:operator-escalation`
