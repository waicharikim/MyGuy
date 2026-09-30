"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logDecisionState = logDecisionState;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/prisma");
const thread_1 = require("../domain/thread");
async function logDecisionState(input) {
    const current = await prisma_1.prisma.thread.findUniqueOrThrow({ where: { id: input.threadId } });
    if (input.known || input.open || input.leaning !== undefined || input.skepticArgument !== undefined || input.decisionSummary !== undefined) {
        await prisma_1.prisma.thread.update({ where: { id: input.threadId }, data: {
                ...(input.known ? { known: input.known } : {}), ...(input.open ? { open: input.open } : {}),
                ...(input.leaning !== undefined ? { leaning: input.leaning } : {}),
                ...(input.skepticArgument !== undefined ? { skepticArgument: input.skepticArgument } : {}),
                ...(input.decisionSummary !== undefined ? { decisionSummary: input.decisionSummary } : {}),
            } });
    }
    if (input.status === "CLOSED")
        await thread_1.threadState.transition(input.threadId, "close", input.currentPass);
    else if (input.status === "ESCALATED")
        await thread_1.threadState.transition(input.threadId, "escalate", input.currentPass);
    else if (input.status === "OPEN" && current.status !== client_1.ThreadStatus.OPEN)
        await thread_1.threadState.transition(input.threadId, "reopen", input.currentPass);
    else if (input.currentPass)
        await thread_1.threadState.transition(input.threadId, "advance", input.currentPass);
    return prisma_1.prisma.thread.update({ where: { id: input.threadId }, data: {
            ...(input.awaitingReply !== undefined ? { awaitingReply: input.awaitingReply } : {}),
            ...(input.awaitingHuman !== undefined ? { awaitingHuman: input.awaitingHuman } : {}),
            ...(input.pendingCloseConfirmation !== undefined ? { pendingCloseConfirmation: input.pendingCloseConfirmation } : {}),
            ...(input.followupCount !== undefined ? { followupCount: input.followupCount } : {}),
        } });
}
