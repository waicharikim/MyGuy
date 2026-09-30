"use strict";
/**
 * Thread resolution for inbound messages.
 *
 * Rules (in order):
 * 1. Exactly one open thread awaiting reply / human / close confirmation → continue it.
 * 2. Exactly one open thread total → continue it.
 * 3. Otherwise ask a fast model; only accept a high-confidence match.
 * 4. Otherwise return ambiguous (never pick newest by default).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveThread = resolveThread;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/prisma");
const model_1 = require("../agent/model");
const getModel = () => (0, model_1.getFastModel)(0);
function stripFences(raw) {
    let s = String(raw ?? "").trim();
    if (s.startsWith("```")) {
        s = s.replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```$/i, "");
    }
    return s.trim();
}
function isAwaitingUserOrOperator(t) {
    return t.awaitingReply || t.pendingCloseConfirmation || t.awaitingHuman;
}
function toCandidate(t) {
    return {
        id: t.id,
        summary: t.decisionSummary ||
            [...t.known, ...t.open].slice(0, 3).join("; ") ||
            "Open matter",
    };
}
async function matchWithModel(text, candidates) {
    const res = await getModel().invoke([
        {
            role: "system",
            content: 'Determine whether the incoming message clearly belongs to exactly one existing open matter. Never choose merely because it is newest. Respond JSON: {"match": "thread-id"|null, "confidence": 0..1}. Only return a thread id when the relationship is specific and clear.',
        },
        {
            role: "user",
            content: JSON.stringify({ message: text, candidates }),
        },
    ]);
    try {
        const parsed = JSON.parse(stripFences(res.content));
        const id = parsed.match;
        const ok = typeof id === "string" &&
            candidates.some((c) => c.id === id) &&
            Number(parsed.confidence) >= 0.82;
        return ok ? id : null;
    }
    catch {
        return null;
    }
}
async function resolveThread(userId, text) {
    const threads = await prisma_1.prisma.thread.findMany({
        where: { userId, status: client_1.ThreadStatus.OPEN },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
            id: true,
            known: true,
            open: true,
            decisionSummary: true,
            awaitingReply: true,
            currentPass: true,
            pendingCloseConfirmation: true,
            awaitingHuman: true,
        },
    });
    if (threads.length === 0) {
        return { type: "new" };
    }
    const awaiting = threads.filter(isAwaitingUserOrOperator);
    if (awaiting.length === 1) {
        return { type: "existing", threadId: awaiting[0].id };
    }
    if (threads.length === 1) {
        return { type: "existing", threadId: threads[0].id };
    }
    const candidates = threads.map(toCandidate);
    const matchId = await matchWithModel(text, candidates);
    if (matchId) {
        return { type: "existing", threadId: matchId };
    }
    return { type: "ambiguous", candidates };
}
