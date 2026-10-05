"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertDecisionRecord = upsertDecisionRecord;
exports.ensureDecisionRecord = ensureDecisionRecord;
exports.updateDecisionRecordStatus = updateDecisionRecordStatus;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/prisma");
async function upsertDecisionRecord(input) {
    const matter = input.matter?.trim() || "Decision matter";
    const recommendedOption = input.recommendedOption?.trim() || null;
    let confidence = null;
    if (input.confidence !== undefined && input.confidence !== null) {
        if (!Number.isFinite(input.confidence) ||
            input.confidence < 0 ||
            input.confidence > 1) {
            throw new Error("Decision confidence must be between 0 and 1");
        }
        confidence = input.confidence;
    }
    if ((recommendedOption === null) !== (confidence === null)) {
        throw new Error("Decision recommendation and confidence must either both be present or both be absent");
    }
    const payload = {
        userId: input.userId,
        threadId: input.threadId,
        matter,
        status: input.status ?? client_1.DecisionRecordStatus.OPEN,
        decisionSummary: input.decisionSummary ?? "",
        goal: input.goal ?? "",
        recommendedOption,
        confidence,
        risks: Array.isArray(input.risks) ? input.risks.filter(Boolean) : [],
        assumptions: Array.isArray(input.assumptions) ? input.assumptions.filter(Boolean) : [],
        unresolvedQuestions: Array.isArray(input.unresolvedQuestions)
            ? input.unresolvedQuestions.filter(Boolean)
            : [],
        evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter(Boolean) : [],
        humanInputs: Array.isArray(input.humanInputs) ? input.humanInputs.filter(Boolean) : [],
        escalationReason: input.escalationReason ?? null,
        recommendedAt: recommendedOption ? new Date() : null,
        closedAt: (input.status ?? client_1.DecisionRecordStatus.OPEN) ===
            client_1.DecisionRecordStatus.RESOLVED
            ? new Date()
            : null,
    };
    return prisma_1.prisma.decisionRecord.upsert({
        where: { threadId: input.threadId },
        create: payload,
        update: payload,
    });
}
async function ensureDecisionRecord(input) {
    await prisma_1.prisma.decisionRecord.createMany({
        data: [{
                userId: input.userId,
                threadId: input.threadId,
                matter: input.matter || "Decision matter",
                goal: input.goal,
                status: input.status,
            }],
        skipDuplicates: true,
    });
}
async function updateDecisionRecordStatus(threadId, status) {
    return prisma_1.prisma.decisionRecord.update({
        where: { threadId },
        data: {
            status,
            closedAt: status === client_1.DecisionRecordStatus.RESOLVED
                ? new Date()
                : null,
        },
    });
}
