# Cross-Domain Context Connections

## Current implementation

When building context for a new or continuing matter, `src/agent/context.ts`
loads a bounded set of the user's open threads, open tasks, recent notes, and
profile. If context items exist, a fast-model call is prompted to return only
concrete connections and to return an empty list when none are found. The
result, including `None found.`, is included in the injected context passed
into Shauri's decision graph.

Current retrieval limits are eight open threads, eight open tasks, and six
recent notes. Older context outside those windows is not considered.

## Example: a potentially relevant connection

**Existing context**

- Open task: renew the land lease before December.
- Note: the user values the Mikeu plot.

**New message**

> I'm thinking about buying the plot next to ours near Mikeu.

A useful connection would mention that the existing lease task may affect the
timing or land-tenure questions for the adjacent purchase, and that the note
may explain why this particular land decision matters. These are hypotheses
for intake to check, not facts to assert.

## Example: no relevant connection

With the same land context, a question about taking an accounting job in
Nairobi should not be connected merely because both involve a major life
choice. The prompt explicitly permits no connection to be returned.

## Limitations and validation

- Connection selection is model-generated and has not been proven reliable
  across live user traffic.
- The parser currently treats malformed connection JSON as no connections;
  that can conceal model-format failures and should be improved before
  treating this as an auditable capability.
- The retrieval window can miss older but relevant context.
- The additional model call contributes latency and provider cost.
- This is contextual assistance, not an authorization or privacy boundary.
  Telegram remains private-chat-only and group messages are ignored.

Validate connection precision and missed-relevance rates using consented,
reviewed examples before expanding the context window or relying on detected
connections for consequential decisions.
