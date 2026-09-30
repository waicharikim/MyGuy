"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestAgentInteraction = requestAgentInteraction;
exports.answerAgentInteraction = answerAgentInteraction;
const prisma_1 = require("../infrastructure/prisma");
async function requestAgentInteraction(input) {
    const [requester, responder] = await Promise.all([
        prisma_1.prisma.agent.findUnique({ where: { name: input.requesterAgent } }),
        prisma_1.prisma.agent.findUnique({ where: { name: input.responderAgent } }),
    ]);
    if (!requester || !responder || !requester.enabled || !responder.enabled) {
        throw new Error("Agent unavailable");
    }
    const capability = await prisma_1.prisma.agentCapability.findFirst({
        where: { agentId: responder.id, name: input.capability, enabled: true },
    });
    const permission = await prisma_1.prisma.agentPermission.findUnique({
        where: {
            requesterAgentId_responderAgentId_capability: {
                requesterAgentId: requester.id,
                responderAgentId: responder.id,
                capability: input.capability,
            },
        },
    });
    if (!capability || !permission?.allowed) {
        throw new Error("Agent interaction not permitted");
    }
    return prisma_1.prisma.agentInteraction.create({
        data: {
            requesterId: requester.id,
            responderId: responder.id,
            capability: input.capability,
            threadId: input.threadId,
            request: input.request,
        },
    });
}
async function answerAgentInteraction(interactionId, response) {
    return prisma_1.prisma.agentInteraction.update({
        where: { id: interactionId },
        data: { response, status: "ANSWERED", completedAt: new Date() },
    });
}
