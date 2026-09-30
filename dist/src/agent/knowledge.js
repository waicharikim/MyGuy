"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promoteHumanAnswerToCandidate = promoteHumanAnswerToCandidate;
const prisma_1 = require("../infrastructure/prisma");
async function promoteHumanAnswerToCandidate(input) {
    return prisma_1.prisma.knowledgeCandidate.create({ data: { userId: input.userId, threadId: input.threadId, proposition: input.proposition, evidence: input.evidence } });
}
