"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHumanQuery = createHumanQuery;
exports.answerHumanQuery = answerHumanQuery;
exports.resumeHumanQueryFromOperator = resumeHumanQueryFromOperator;
const prisma_1 = require("../infrastructure/prisma");
const thread_1 = require("../domain/thread");
async function createHumanQuery(input) {
    const open = await prisma_1.prisma.humanQuery.findFirst({ where: { threadId: input.threadId, status: "OPEN" } });
    if (open)
        return open;
    const q = await prisma_1.prisma.humanQuery.create({
        data: {
            userId: input.userId,
            threadId: input.threadId,
            matter: input.matter,
            question: input.question,
            knownContext: input.knownContext,
            reason: input.reason,
            source: input.source || "USER",
            messages: { create: { direction: "SYSTEM", content: input.question } },
        },
    });
    await thread_1.threadState.transition(input.threadId, "pause_human", "GROUND");
    return q;
}
/**
 * Records a human answer and makes the persisted thread resumable.
 *
 * This function intentionally does not run the graph. That keeps the
 * user-answer path safe: runShauriGraph can record the inbound answer and
 * continue in the same invocation without recursively invoking itself.
 */
async function answerHumanQuery(id, answer) {
    const cleanAnswer = answer.trim();
    if (!cleanAnswer)
        throw new Error("Human answer cannot be empty");
    const q = await prisma_1.prisma.humanQuery.findUniqueOrThrow({ where: { id } });
    if (q.status !== "OPEN")
        throw new Error(`Human query ${id} is already ${q.status}`);
    const updated = await prisma_1.prisma.$transaction(async (tx) => {
        const claimed = await tx.humanQuery.updateMany({
            where: { id, status: "OPEN" },
            data: { status: "ANSWERED", answer: cleanAnswer, answeredAt: new Date() },
        });
        if (claimed.count !== 1)
            throw new Error(`Human query ${id} was already answered`);
        await tx.humanQueryMessage.create({
            data: { humanQueryId: id, direction: "IN", content: cleanAnswer },
        });
        await tx.knowledgeCandidate.create({
            data: {
                userId: q.userId,
                threadId: q.threadId,
                proposition: cleanAnswer,
                evidence: { source: "human" },
            },
        });
        const thread = await tx.thread.findUniqueOrThrow({ where: { id: q.threadId } });
        const known = [...thread.known, `Human-provided evidence: ${cleanAnswer}`];
        await tx.thread.update({
            where: { id: q.threadId },
            data: {
                awaitingHuman: false,
                awaitingSource: q.source,
                awaitingReply: false,
                currentPass: "GROUND",
                known: Array.from(new Set(known)),
            },
        });
        return tx.humanQuery.findUniqueOrThrow({ where: { id } });
    });
    return updated;
}
/**
 * Operator path:
 * 1. atomically record the human answer;
 * 2. send the answer to the user;
 * 3. resume Shauri from the persisted GROUND pass;
 * 4. persist and deliver Shauri's follow-on response.
 */
async function resumeHumanQueryFromOperator(id, answer) {
    const q = await answerHumanQuery(id, answer);
    const user = await prisma_1.prisma.user.findUniqueOrThrow({ where: { id: q.userId } });
    // Imported lazily to avoid a module cycle: graph -> human-query.
    const { runShauriGraph } = await Promise.resolve().then(() => __importStar(require("./graph")));
    const { buildInjectedContext } = await Promise.resolve().then(() => __importStar(require("./context")));
    const { sendWhatsappMessage } = await Promise.resolve().then(() => __importStar(require("../whatsapp/send")));
    await sendWhatsappMessage(user.phone, answer);
    await prisma_1.prisma.message.create({
        data: {
            threadId: q.threadId,
            direction: "OUT",
            content: answer,
            channel: "whatsapp",
            metadata: { source: "human_operator", humanQueryId: q.id },
        },
    });
    const result = await runShauriGraph({
        threadId: q.threadId,
        userId: q.userId,
        rawInput: answer,
        injectedContext: await buildInjectedContext(q.userId, answer),
    });
    await prisma_1.prisma.message.create({
        data: {
            threadId: q.threadId,
            direction: "OUT",
            content: result.reply,
            channel: "whatsapp",
            metadata: { source: "shauri_resume", humanQueryId: q.id },
        },
    });
    await sendWhatsappMessage(user.phone, result.reply);
    return { query: q, reply: result.reply, awaitingReply: result.awaitingReply };
}
