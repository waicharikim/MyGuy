"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureRequestedDecisionOutcome = captureRequestedDecisionOutcome;
exports.classifyDecisionOutcome = classifyDecisionOutcome;
exports.listUnclassifiedDecisionOutcomes = listUnclassifiedDecisionOutcomes;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/prisma");
async function captureRequestedDecisionOutcome(threadId, notes) {
    const cleanNotes = notes.trim();
    if (!cleanNotes) {
        throw new Error("Decision outcome notes cannot be empty");
    }
    return prisma_1.prisma.$transaction(async (tx) => {
        const thread = await tx.thread.findUniqueOrThrow({
            where: { id: threadId },
            select: { outcomeRequestedAt: true },
        });
        if (!thread.outcomeRequestedAt) {
            throw new Error(`Thread ${threadId} has no pending outcome request`);
        }
        const now = new Date();
        const updated = await tx.thread.updateMany({
            where: {
                id: threadId,
                outcomeRequestedAt: thread.outcomeRequestedAt,
            },
            data: { outcomeRequestedAt: null },
        });
        if (updated.count !== 1) {
            throw new Error(`Outcome request for thread ${threadId} was already handled`);
        }
        return tx.decisionRecord.update({
            where: { threadId },
            data: {
                outcomeStatus: client_1.DecisionOutcomeStatus.UNCLEAR,
                outcomeNotes: cleanNotes,
                outcomeSource: client_1.DecisionOutcomeSource.USER,
                outcomeAt: now,
            },
        });
    });
}
async function classifyDecisionOutcome(input) {
    const notes = input.notes?.trim();
    return prisma_1.prisma.decisionRecord.update({
        where: { threadId: input.threadId },
        data: {
            outcomeStatus: input.status,
            ...(notes ? { outcomeClassificationNotes: notes } : {}),
            outcomeClassifiedAt: new Date(),
        },
    });
}
async function listUnclassifiedDecisionOutcomes() {
    return prisma_1.prisma.decisionRecord.findMany({
        where: {
            outcomeStatus: client_1.DecisionOutcomeStatus.UNCLEAR,
            outcomeSource: client_1.DecisionOutcomeSource.USER,
        },
        orderBy: { outcomeAt: "asc" },
        take: 50,
        select: {
            threadId: true,
            userId: true,
            matter: true,
            decisionSummary: true,
            recommendedOption: true,
            outcomeNotes: true,
            outcomeAt: true,
            user: {
                select: { phone: true },
            },
        },
    });
}
