"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertDecisionRecord = upsertDecisionRecord;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/prisma");
async function upsertDecisionRecord(input) {
    const matter = input.matter?.trim() || "Decision matter";
    const payload = {
        userId: input.userId,
        threadId: input.threadId,
        matter,
        status: input.status ?? client_1.DecisionRecordStatus.OPEN,
        decisionSummary: input.decisionSummary ?? "",
        goal: input.goal ?? "",
        recommendedOption: input.recommendedOption ?? "",
        confidence: Number.isFinite(input.confidence ?? 0) ? Number(input.confidence ?? 0) : 0,
        risks: Array.isArray(input.risks) ? input.risks.filter(Boolean) : [],
        assumptions: Array.isArray(input.assumptions) ? input.assumptions.filter(Boolean) : [],
        evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter(Boolean) : [],
        humanInputs: Array.isArray(input.humanInputs) ? input.humanInputs.filter(Boolean) : [],
        escalationReason: input.escalationReason ?? null,
    };
    return prisma_1.prisma.decisionRecord.upsert({
        where: { threadId: input.threadId },
        create: payload,
        update: payload,
    });
}
