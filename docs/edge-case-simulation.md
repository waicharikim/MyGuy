# Edge-Case Behavior: Closure and Follow-Up Limits

This document records the current implementation behavior and the regression
checks that cover it. It is not a claim that every language-model output or
real-world user interaction has been validated.

## Scenario A: close confirmation

The Close pass cannot close a matter solely because the model marks it
resolved. It asks the user to confirm:

1. The thread remains open with `pendingCloseConfirmation` set.
2. A clear affirmative response closes the matter and updates the decision
   record.
3. A negative response clears the pending confirmation and asks what remains
   unresolved.

The close-confirmation handler recognizes configured yes/no phrases. Ambiguous
or culturally specific phrasing may still need better handling; a real-user
pilot should test this before relying on it as a universal classifier.

## Scenario B: user does not respond to follow-ups

Scheduled follow-ups are bounded by `MAX_FOLLOWUPS` (default `4`). At the
limit:

1. The exhausted follow-up is marked `CANCELLED`.
2. The thread stops waiting for an outcome reply and pending outcome-selection
   state is cleared.
3. No new operator escalation is created merely because the user was silent.
4. The decision remains open, so a later user message can continue it.

This avoids treating non-response as evidence that a human intervention is
needed. The limit bounds reminders, not the user's decision window. The
threshold is configurable and should be revisited using consented pilot data.

The limit behavior is covered by `npm run test:followup-limit`.

## Scenario C: a public fact cannot be verified

Shauri searches public claims through Tavily when configured. If the service
is unavailable or returns no usable evidence, the graph asks the user for an
official source, a document, or identifying details. It does not assign a
public web search to an operator by default. Private details controlled by
another party, such as an employer's offer date, should be obtained by the
user unless an authorized Shauri operator has direct responsibility and
access.

## Remaining validation

- Exercise close confirmation with a consented multilingual pilot, including
  ambiguous replies.
- Verify full graph behavior with the configured model and Tavily providers.
- Confirm follow-up timing, retry, and user-resumption behavior in staging.
- Review the follow-up cap against product expectations and pilot evidence;
  do not treat it as a measured optimal threshold.
