"use strict";
/**
 * Thread resolution for inbound messages.
 *
 * Responsibilities:
 *
 *   "Which existing matter, if any, does this message belong to?"
 *
 * Resolution order:
 *
 * 1. No open threads
 *      → NEW
 *
 * 2. USER-awaiting threads
 *      → determine whether the incoming message answers one of them
 *
 * 3. Semantic matching against all open matters
 *      → EXISTING when exactly one sufficiently confident match exists
 *
 * 4. No sufficiently confident match
 *      → NEW
 *
 * 5. Multiple plausible matches
 *      → AMBIGUOUS
 *
 * IMPORTANT:
 *
 * OPERATOR-owned HumanQueries are never treated as user-answerable.
 *
 * A user message can potentially refer to an operator-owned matter,
 * but it must not satisfy the HumanQuery itself.
 *
 * IMPORTANT:
 *
 * "awaitingReply" does NOT mean:
 *
 *   "the next message must belong to this thread."
 *
 * It means:
 *
 *   "Shauri currently expects the user to answer a specific question."
 *
 * Therefore we still verify that the incoming message is actually
 * an answer to that pending question.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveThread = resolveThread;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/prisma");
const model_1 = require("../agent/model");
const getModel = () => (0, model_1.getFastModel)(0);
function stripFences(raw) {
    let value = String(raw ?? "").trim();
    if (value.startsWith("```")) {
        value = value
            .replace(/^```(?:json|JSON)?\s*/i, "")
            .replace(/\s*```$/i, "");
    }
    return value.trim();
}
function isUserAwaiting(thread) {
    return (thread.awaitingReply ||
        thread.pendingCloseConfirmation ||
        (thread.awaitingHuman &&
            thread.awaitingSource ===
                client_1.HumanQuerySource.USER));
}
function toCandidate(thread) {
    return {
        id: thread.id,
        summary: thread.decisionSummary ||
            [
                ...thread.known,
                ...thread.open,
            ]
                .filter(Boolean)
                .slice(0, 3)
                .join("; ") ||
            "Open matter",
    };
}
/**
 * Determine whether an incoming message actually answers
 * a pending USER question.
 *
 * This is deliberately different from general thread matching.
 *
 * Example:
 *
 * Pending:
 *   "What does the flexibility of freelancing enable for you?"
 *
 * Message:
 *   "It lets me spend more time with family."
 *
 * → answersQuestion = true
 *
 * But:
 *
 * Message:
 *   "Should I buy a plot near my parents' home?"
 *
 * → answersQuestion = false
 *
 * The latter should be allowed to create a new matter.
 */
async function answersPendingQuestion(text, pending) {
    const response = await getModel().invoke([
        {
            role: "system",
            content: `
You are Shauri's pending-question classifier.

Determine whether the incoming user message is actually an answer
to the specific question that Shauri is currently waiting for.

Return ONLY valid JSON:

{
  "answersQuestion": true | false,
  "confidence": 0.0,
  "reason": ""
}

Rules:

- The incoming message must directly answer, clarify, or provide
  information requested by the pending question.
- A completely new decision is NOT an answer.
- A new topic is NOT an answer.
- A message that merely mentions something from the existing matter
  is not necessarily an answer.
- Do not use the fact that this is the only pending question as
  evidence that it is an answer.
- Do not use recency as evidence.
- Do not force a match.
- confidence must be between 0 and 1.
- Return true only when confidence is at least 0.82.

Example:

Pending question:
"What does the flexibility of freelancing enable for you?"

Incoming:
"It lets me spend more time with my family and work on my own projects."

Return true.

Pending question:
"What does the flexibility of freelancing enable for you?"

Incoming:
"Should I buy a plot near my parents' home?"

Return false.

Pending question:
"What are your essential monthly expenses?"

Incoming:
"My rent is KES 30,000 and I support my younger siblings."

Return true.

Pending question:
"What are your essential monthly expenses?"

Incoming:
"I've decided I want to buy land."

Return false.
`.trim(),
        },
        {
            role: "user",
            content: JSON.stringify({
                pendingQuestion: pending.question,
                existingMatter: pending.summary,
                incomingMessage: text,
            }),
        },
    ]);
    try {
        const parsed = JSON.parse(stripFences(response.content));
        const confidence = Number(parsed.confidence);
        return (parsed.answersQuestion === true &&
            Number.isFinite(confidence) &&
            confidence >= 0.82);
    }
    catch {
        return false;
    }
}
/**
 * Semantic matching across open matters.
 *
 * This is used after pending USER questions have been checked.
 *
 * A message can therefore:
 *
 *   - answer a pending question
 *   - continue an existing matter semantically
 *   - start a new matter
 *   - remain ambiguous
 */
async function matchWithModel(text, candidates) {
    if (candidates.length === 0) {
        return null;
    }
    const response = await getModel().invoke([
        {
            role: "system",
            content: `
You are Shauri's thread resolver.

Determine whether the incoming message clearly belongs to exactly
ONE existing open matter.

Do NOT choose a thread merely because:

- it is the newest thread
- it was updated most recently
- it appears first
- there is only one candidate
- the user has an unanswered question in that thread

The message must have a specific semantic relationship to the
candidate matter.

Example:

Existing matter:
"Should I take the accounting job or stay freelance?"

Incoming:
"I've freelanced for 2 years and the income is unstable."

This IS a continuation.

Existing matter:
"Should I take the accounting job or stay freelance?"

Incoming:
"Should I buy the plot next to my parents' place?"

This is NOT a continuation.

Existing matter:
"Should I take the accounting job or stay freelance?"

Incoming:
"I think I'm going to go ahead with it."

This is ambiguous unless the candidate context makes the
reference genuinely specific.

If the message clearly belongs to one matter, return that
thread's ID.

If it does not clearly belong to any matter, return null.

If it could reasonably belong to more than one matter, return null.

Return ONLY valid JSON:

{
  "match": "thread-id" | null,
  "confidence": 0.0
}

Rules:

- confidence must be between 0 and 1
- only return a supplied thread ID
- never invent an ID
- confidence must be at least 0.82 for a match
- do not use recency as evidence
- do not use candidate ordering as evidence
- do not assume that one candidate means a match
- references such as "it", "that", "this one", or "go ahead"
  are not sufficient by themselves
`.trim(),
        },
        {
            role: "user",
            content: JSON.stringify({
                message: text,
                candidates,
            }),
        },
    ]);
    try {
        const parsed = JSON.parse(stripFences(response.content));
        const match = parsed.match;
        if (typeof match !== "string" ||
            !candidates.some((candidate) => candidate.id === match)) {
            return null;
        }
        const confidence = Number(parsed.confidence);
        if (!Number.isFinite(confidence)) {
            return null;
        }
        if (confidence < 0.82) {
            return null;
        }
        return match;
    }
    catch {
        return null;
    }
}
async function resolveThread(userId, text) {
    const threads = await prisma_1.prisma.thread.findMany({
        where: {
            userId,
            status: client_1.ThreadStatus.OPEN,
        },
        orderBy: {
            updatedAt: "desc",
        },
        take: 8,
        select: {
            id: true,
            known: true,
            open: true,
            decisionSummary: true,
            awaitingReply: true,
            pendingCloseConfirmation: true,
            awaitingHuman: true,
            awaitingSource: true,
        },
    });
    /*
     * ---------------------------------------------------------------
     * 1. No open matters
     * ---------------------------------------------------------------
     */
    if (threads.length === 0) {
        return {
            type: "new",
        };
    }
    /*
     * ---------------------------------------------------------------
     * 2. Check USER-awaiting matters
     * ---------------------------------------------------------------
     *
     * IMPORTANT:
     *
     * We no longer immediately attach the message to the sole
     * USER-awaiting thread.
     *
     * First we determine whether the message actually answers
     * the pending question.
     */
    const awaitingUser = threads.filter(isUserAwaiting);
    if (awaitingUser.length > 0) {
        /*
         * Retrieve the actual open USER HumanQuery where possible.
         *
         * This gives the classifier the exact question rather than
         * relying only on thread.open.
         */
        const pendingQuestions = await Promise.all(awaitingUser.map(async (thread) => {
            const candidate = toCandidate(thread);
            let question = thread.open.at(-1) ||
                candidate.summary;
            if (thread.awaitingHuman &&
                thread.awaitingSource ===
                    client_1.HumanQuerySource.USER) {
                const humanQuery = await prisma_1.prisma.humanQuery.findFirst({
                    where: {
                        threadId: thread.id,
                        status: "OPEN",
                        source: client_1.HumanQuerySource.USER,
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                    select: {
                        question: true,
                    },
                });
                if (humanQuery?.question) {
                    question =
                        humanQuery.question;
                }
            }
            return {
                threadId: thread.id,
                question,
                summary: candidate.summary,
            };
        }));
        /*
         * -------------------------------------------------------------
         * 2A. Find whether the message answers exactly one pending
         *     USER question.
         * -------------------------------------------------------------
         */
        const answerMatches = [];
        for (const pending of pendingQuestions) {
            const answers = await answersPendingQuestion(text, pending);
            if (answers) {
                answerMatches.push(pending.threadId);
            }
        }
        /*
         * Exactly one pending question is answered.
         */
        if (answerMatches.length === 1) {
            return {
                type: "existing",
                threadId: answerMatches[0],
            };
        }
        /*
         * More than one pending question appears compatible.
         *
         * Let normal semantic resolution decide whether the message
         * can be associated safely.
         */
        if (answerMatches.length > 1) {
            const candidates = threads.map(toCandidate);
            const matchId = await matchWithModel(text, candidates);
            if (matchId) {
                return {
                    type: "existing",
                    threadId: matchId,
                };
            }
            return {
                type: "ambiguous",
                candidates,
            };
        }
    }
    /*
     * ---------------------------------------------------------------
     * 3. Semantic resolution
     * ---------------------------------------------------------------
     *
     * This is also used when there is only one open thread.
     *
     * This is important because:
     *
     * Thread A:
     *   accounting job vs freelance
     *
     * User:
     *   should I buy a plot?
     *
     * must become:
     *
     *   NEW
     *
     * rather than:
     *
     *   EXISTING(Thread A)
     */
    const candidates = threads.map(toCandidate);
    const matchId = await matchWithModel(text, candidates);
    /*
     * ---------------------------------------------------------------
     * 4. Existing thread
     * ---------------------------------------------------------------
     */
    if (matchId) {
        return {
            type: "existing",
            threadId: matchId,
        };
    }
    /*
     * ---------------------------------------------------------------
     * 5. No sufficiently confident match
     * ---------------------------------------------------------------
     *
     * IMPORTANT:
     *
     * No match means NEW.
     *
     * It does NOT mean AMBIGUOUS.
     *
     * AMBIGUOUS should only be returned when multiple existing
     * matters are genuinely plausible and we have evidence that
     * the user is referring to one of them.
     *
     * With the current semantic matcher, null means:
     *
     *   "none of the existing matters is sufficiently related."
     *
     * Therefore create a new matter.
     */
    return {
        type: "new",
    };
}
