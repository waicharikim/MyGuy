"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOperatorQueue = getOperatorQueue;
const prisma_1 = require("../infrastructure/prisma");
const operatorThreadSelect = {
    id: true,
    status: true,
    decisionSummary: true,
    known: true,
    open: true,
    leaning: true,
    skepticArgument: true,
    user: {
        select: {
            phone: true,
            profile: {
                select: {
                    summary: true,
                    values: true,
                    recurringConcerns: true,
                },
            },
        },
    },
    decisionRecords: {
        select: {
            matter: true,
            status: true,
            decisionSummary: true,
            goal: true,
            recommendedOption: true,
            confidence: true,
            risks: true,
            assumptions: true,
            unresolvedQuestions: true,
            evidenceRefs: true,
            humanInputs: true,
            escalationReason: true,
            updatedAt: true,
        },
    },
    groundingEvidence: {
        orderBy: { retrievedAt: "desc" },
        take: 10,
        select: {
            claim: true,
            sourceUrl: true,
            sourceTitle: true,
            finding: true,
            confidence: true,
        },
    },
};
async function getOperatorQueue() {
    const [queries, escalations] = await Promise.all([
        prisma_1.prisma.humanQuery.findMany({
            where: {
                status: "OPEN",
                source: "OPERATOR",
            },
            orderBy: { createdAt: "asc" },
            include: {
                thread: { select: operatorThreadSelect },
            },
        }),
        prisma_1.prisma.escalation.findMany({
            where: { status: "OPEN" },
            orderBy: { createdAt: "asc" },
            include: {
                thread: { select: operatorThreadSelect },
                user: {
                    select: {
                        phone: true,
                        profile: {
                            select: {
                                summary: true,
                                values: true,
                                recurringConcerns: true,
                            },
                        },
                    },
                },
            },
        }),
    ]);
    return {
        generatedAt: new Date().toISOString(),
        humanQueries: queries.map((query) => ({
            id: query.id,
            createdAt: query.createdAt,
            matter: query.matter,
            question: query.question,
            reason: query.reason,
            knownContext: query.knownContext,
            source: query.source,
            status: query.status,
            thread: query.thread,
        })),
        escalations: escalations.map((escalation) => ({
            id: escalation.id,
            createdAt: escalation.createdAt,
            reason: escalation.reason,
            user: escalation.user,
            thread: escalation.thread,
        })),
    };
}
