"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeMessage = routeMessage;
const prisma_1 = require("../infrastructure/prisma");
const model_1 = require("./model");
const getModel = () => (0, model_1.getFastModel)(0);
function stripFences(raw) {
    let s = String(raw ?? "").trim();
    if (s.startsWith("```")) {
        s = s.replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```$/i, "");
    }
    return s.trim();
}
function parseRoute(value) {
    try {
        const text = typeof value === "string" ? stripFences(value) : JSON.stringify(value);
        const parsed = JSON.parse(text);
        const allowed = [
            "shauri_new",
            "shauri_continue",
            "task_create",
            "note_create",
            "finance_query",
            "escalation_request",
            "unclear",
        ];
        const intent = allowed.includes(parsed?.intent)
            ? parsed.intent
            : "unclear";
        return {
            intent,
            extracted: typeof parsed?.extracted === "string"
                ? parsed.extracted.trim()
                : undefined,
        };
    }
    catch {
        return { intent: "unclear" };
    }
}
async function routeMessage(userId, text) {
    const awaiting = await prisma_1.prisma.thread.findMany({
        where: {
            userId,
            status: "OPEN",
            OR: [
                { awaitingReply: true },
                { pendingCloseConfirmation: true },
                { awaitingHuman: true },
            ],
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
    });
    if (awaiting.length === 1) {
        return { intent: "shauri_continue", threadId: awaiting[0].id };
    }
    const res = await getModel().invoke([
        {
            role: "system",
            content: 'Classify the message. Respond only JSON: {"intent":"shauri_new|shauri_continue|task_create|note_create|finance_query|escalation_request|unclear","extracted":""}. Never infer shauri_continue without a clear reference to an existing matter.',
        },
        { role: "user", content: text },
    ]);
    return parseRoute(res.content);
}
