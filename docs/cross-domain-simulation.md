# Cross-Domain Connection Simulation

Traced against `central.ts`'s `buildInjectedContext` and `detectConnections`, the same way the closing guardrails were traced — a logical walkthrough of the code as written, not a live-LLM test run.

---

## Scenario: does a real connection actually surface?

**Setup — existing state for this user:**
- Open task (from an earlier `task_create`): *"Renew the land lease before December"*
- Open note: *"Dad always said the Mikeu plot was worth holding onto"*
- No open shauri threads

**New message:** *"Thinking about buying the plot next to ours near Mikeu — good time?"*

**Trace:**

1. `handleMessage` classifies this as `shauri_new` (no awaiting thread, message reads as a new decision, not a continuation).
2. Before payment/intake ever run, `buildInjectedContext(userId, text)` fires:
   - `gatherContext` pulls the task and note listed above
   - `detectConnections(text, ctx)` runs a dedicated model call with **only one job**: does this new message genuinely connect to anything in the existing lists
3. Expected model output, given the inputs:
   ```
   - The land lease task is directly relevant: if the lease isn't renewed, buying an adjacent plot may be premature or complicated by land tenure status.
   - The note about the Mikeu plot's value is relevant context for why this decision matters to the person, not just a logistics question.
   ```
4. This becomes the **first thing** in the injected context text — ahead of the generic profile/task/note dump — specifically so intake can't miss it the way it could when everything was one undifferentiated block.
5. After payment succeeds and the thread is created, `intake` runs with this injected context. Its system prompt explicitly says: *"pay particular attention to this — it's the part that isn't just background."* A reasonable expectation: intake's clarifying question (if any) references the lease status directly — e.g. *"Is the current lease renewed or still pending? That seems tied to this."* — rather than treating the new plot purchase as an isolated question.

**What this fixes, concretely:** before this pass, the task and note would have been dumped into the prompt as flat lists with no signal about relevance. Intake had to notice the connection itself, competing with a profile summary and other unrelated recent items. Now the connection is surfaced as its own labeled section, computed by a pass whose only job is judging relevance — not inferred incidentally by a pass that's busy doing something else.

---

## Scenario: the "None found" case — does it avoid forcing false connections?

**Setup:** same task and note as above.

**New message:** *"Should I take the accounting job in Nairobi or stay freelance?"*

**Trace:**

1. `detectConnections` runs against the same task/note context.
2. Expected output: `"None found."` — a land lease and a note about a specific plot's sentimental value have no genuine bearing on a Nairobi job decision. The prompt explicitly instructs against forcing thematic-but-not-actually-relevant links ("not vague thematic similarity").
3. Injected context still carries this line plainly — `"Detected connections to this message: None found."` — rather than omitting the section or fabricating a stretch connection to seem more capable.

**What this guards against:** the earlier version of the risk here isn't premature closure, it's a differently-shaped failure — an agent that *always* claims to find connections because it's rewarded for seeming perceptive. The explicit instruction to output "None found" as a valid, expected answer is what stands between real cross-domain awareness and a system that manufactures false pattern-matching to look smarter than it is.

---

## What Remains Unverified

- **Not run against a live LLM.** Both traces above are reasoned through the prompt design and code path, not observed from an actual model call. The real test is whether the model reliably resists the temptation to manufacture a connection when told explicitly not to — that's a known LLM failure mode (over-eager pattern-matching), and the instruction alone doesn't guarantee it won't happen.
- **Scale is still a real limit.** `gatherContext` only pulls the last 3 threads / 5 tasks / 3 notes. A genuinely relevant older item (a task closed months ago, a note buried further back) would never even reach `detectConnections` to be considered. This fix makes the reasoning over the visible window real; it doesn't widen the window.
- **Cost.** This adds a second model call (`detectConnections`) to every `shauri_new`/`shauri_continue` message, on top of the intake/skeptic/ground/close calls already happening. At the token/cost levels discussed earlier this is still cheap in absolute terms, but it's a real addition worth tracking, not a free improvement.
