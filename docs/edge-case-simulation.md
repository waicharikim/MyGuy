# Edge Case Simulation — Premature Close & Never Closes

Traced step-by-step against the actual orchestrator/worker/close logic, not a hypothetical. Both scenarios assume a thread already past intake (known/open established), mid-pipeline.

---

## Scenario A: Premature closure

**Setup:** User is deciding whether to buy a plot of land. First exchange establishes basic facts. Close pass, on this very first pass, judges (incorrectly, or too eagerly) that the matter is resolved.

**Trace:**

1. `close()` runs, model returns `{"nextAction": "You've decided to proceed", "escalate": false, "resolved": true}`
2. **Before the fix:** this would have immediately set `status: "closed"` and called `updateProfileFromThread` — wrong, the user never actually confirmed anything, the model just misjudged tone as certainty.
3. **After the fix:** `resolved: true` triggers the confirmation branch instead:
   ```
   logDecisionState({ threadId, currentPass: "close", awaitingReply: true, pendingCloseConfirmation: true })
   ```
   Thread status stays `"open"`. Reply sent: *"You've decided to proceed. Sounds like this might be settled — should I close this out? (yes/no)"*
4. User replies: **"no, I still need to check the title deed"**
5. Next inbound message hits `runShauriStep`. `thread.pendingCloseConfirmation` is `true` → routes to `handleCloseConfirmation`.
6. Regex checks: `isYes` → false. `isNo` → matches `/^\s*(no|...)/i` → true.
7. Result: `pendingCloseConfirmation: false`, `awaitingReply: true`, `currentPass: "intake"`. Reply: *"No problem — what's still open on this?"*
8. Thread stays open, correctly, and resumes as an intake-style continuation with the title-deed concern folded in.

**What this catches:** a single overconfident model judgment can no longer close a thread unilaterally. The user is the actual authority on whether their own matter is resolved.

**What it doesn't catch:** if the user themselves says "yes" to a confirmation that was actually premature (they got swept along, or misread the question), the thread closes anyway — this guardrail protects against the *model* being wrong, not against the *user* being rushed. That's a real remaining limit, not fully solvable in code; the confirmation step at least creates one deliberate pause rather than zero.

---

## Scenario B: Never closes

**Setup:** User is deciding on a job offer. Genuinely indecisive — every follow-up gets a noncommittal reply ("still thinking," "haven't decided," "need more time").

**Trace:**

1. Thread closes intake, runs through skeptic/ground/close normally. `close()` returns `resolved: false` (legitimately — nothing's settled). Task created, follow-up scheduled, `followupCount` still `0`.
2. **Follow-up 1 fires** (worker, `+3 days`). `thread.followupCount` (0) < `MAX_FOLLOWUPS` (4) → sends check-in, increments to `1`.
3. User replies noncommittally. `pendingCloseConfirmation` is false, `currentPass === "close"` and `awaitingReply` true → orchestrator's follow-up-resume branch runs `close()` again with the update appended to `known`. Model again returns `resolved: false`. New follow-up scheduled.
4. **Follow-ups 2 and 3 fire** the same way. `followupCount` → `2`, then `3`. Same noncommittal pattern each time.
5. **Follow-up 4 fires.** Worker checks `thread.followupCount >= MAX_FOLLOWUPS` — **before** this fix, this check didn't exist, and the cycle above would repeat indefinitely, forever incrementing nothing, forever pinging the user.
6. **After the fix:** at `followupCount === 4`, the guardrail branch fires instead of another normal check-in:
   - `notifyEscalation(...)` — a human is actually notified
   - User is sent: *"This has been open a while without settling — I'm bringing in a person to help you close it out."*
   - `status` set to `"escalated"`
   - `updateProfileFromThread` fires — the pattern (indecision on this category of decision) becomes part of what the profile knows about this person, which is itself useful: the *recurring concern* is real information, not a failure to hide.

**What this catches:** the loop is now bounded. A person who never resolves a matter doesn't get pinged forever, and — importantly — indecision itself becomes a signal to bring in a human, matching the humility principle (the agent knows when it isn't the right tool for the moment).

**What it doesn't catch:** `MAX_FOLLOWUPS = 4` is an arbitrary number picked for this pass, not derived from any real usage data — it may be too aggressive (escalating genuinely-still-in-progress matters, like a land purchase that legitimately takes months) or too lax (someone who wanted out after follow-up 1). This threshold should be revisited once there's real thread data to look at, not left as a magic number.

---

## What Remains Unverified

Both traces above are logical walkthroughs against the code as written — they haven't been run against the live pipeline with a real LLM in the loop. Two things worth checking with real runs before trusting this fully:
- Does the model reliably return well-formed `{"resolved": ...}` JSON, or does the `JSON.parse` fallback (defaulting to `resolved: false`) trigger more often than expected?
- Does the yes/no regex in `handleCloseConfirmation` actually cover how real users phrase confirmation in practice (including Sheng/Swahili-inflected replies), or does it need a wider net / LLM fallback for ambiguous cases?
