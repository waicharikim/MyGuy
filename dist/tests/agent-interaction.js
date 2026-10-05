"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/infrastructure/prisma");
const interaction_1 = require("../src/agent/interaction");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function main() {
    const suffix = Date.now().toString();
    const userA = await prisma_1.prisma.user.create({
        data: { phone: `254702${suffix.slice(-7)}` },
    });
    const userB = await prisma_1.prisma.user.create({
        data: { phone: `254703${suffix.slice(-7)}` },
    });
    try {
        const [requester, responder] = await Promise.all([
            prisma_1.prisma.agent.create({
                data: {
                    name: `requester-${suffix}`,
                    description: "Test requester agent",
                    ownerUserId: userA.id,
                },
            }),
            prisma_1.prisma.agent.create({
                data: {
                    name: `responder-${suffix}`,
                    description: "Test responder agent",
                    ownerUserId: userB.id,
                    capabilities: {
                        create: {
                            name: "SHARE_CONTEXT",
                            description: "Share explicitly authorized project context",
                        },
                    },
                },
            }),
        ]);
        const [ownedThread, foreignThread] = await Promise.all([
            prisma_1.prisma.thread.create({ data: { userId: userA.id } }),
            prisma_1.prisma.thread.create({ data: { userId: userB.id } }),
        ]);
        const baseInput = {
            requesterAgent: requester.name,
            responderAgent: responder.name,
            capability: "SHARE_CONTEXT",
            request: { project: "Community garden", question: "May I share the meeting date?" },
        };
        let denied = false;
        try {
            await (0, interaction_1.requestAgentInteraction)({ ...baseInput, threadId: ownedThread.id });
        }
        catch (error) {
            denied = error instanceof Error && error.message === "Agent interaction not permitted";
        }
        assert(denied, "An interaction without an explicit grant must be denied.");
        await prisma_1.prisma.agentPermission.create({
            data: {
                requesterAgentId: requester.id,
                responderAgentId: responder.id,
                capability: "SHARE_CONTEXT",
                allowed: true,
            },
        });
        let crossUserThreadDenied = false;
        try {
            await (0, interaction_1.requestAgentInteraction)({ ...baseInput, threadId: foreignThread.id });
        }
        catch (error) {
            crossUserThreadDenied =
                error instanceof Error &&
                    error.message.includes("outside the requester agent's scope");
        }
        assert(crossUserThreadDenied, "An agent cannot attach another user's thread to an interaction.");
        const interaction = await (0, interaction_1.requestAgentInteraction)({
            ...baseInput,
            threadId: ownedThread.id,
        });
        assert(interaction.status === "REQUESTED", "Allowed requests should be persisted.");
        let wrongResponderDenied = false;
        try {
            await (0, interaction_1.answerAgentInteraction)(interaction.id, requester.name, {
                answer: "Not authorized",
            });
        }
        catch (error) {
            wrongResponderDenied =
                error instanceof Error &&
                    error.message.includes("not assigned to this responder");
        }
        assert(wrongResponderDenied, "Only the addressed responder agent may answer.");
        const answered = await (0, interaction_1.answerAgentInteraction)(interaction.id, responder.name, {
            answer: "The meeting is on Saturday.",
        });
        assert(answered.status === "ANSWERED", "The authorized responder answer should complete the interaction.");
        let duplicateDenied = false;
        try {
            await (0, interaction_1.answerAgentInteraction)(interaction.id, responder.name, {
                answer: "A second answer",
            });
        }
        catch (error) {
            duplicateDenied = error instanceof Error &&
                error.message.includes("Only a requested interaction");
        }
        assert(duplicateDenied, "Answered interactions must not be overwritten.");
        const messages = await prisma_1.prisma.agentInteractionMessage.findMany({
            where: { interactionId: interaction.id },
            orderBy: { createdAt: "asc" },
        });
        assert(messages.length === 2 &&
            messages[0].direction === "OUT" &&
            messages[1].direction === "IN", "Request and response must both be retained in the interaction audit trail.");
        console.log("✓ permission grant required for cross-agent interaction");
        console.log("✓ requester-owned thread scoping blocks cross-user context");
        console.log("✓ responder identity, one-time answer, and audit lifecycle enforced");
    }
    finally {
        await prisma_1.prisma.agentInteractionMessage.deleteMany({
            where: { interaction: { requester: { ownerUserId: userA.id } } },
        });
        await prisma_1.prisma.agentInteraction.deleteMany({
            where: { requester: { ownerUserId: userA.id } },
        });
        await prisma_1.prisma.agentPermission.deleteMany({
            where: {
                OR: [
                    { requesterAgent: { ownerUserId: userA.id } },
                    { responderAgent: { ownerUserId: userB.id } },
                ],
            },
        });
        await prisma_1.prisma.agentCapability.deleteMany({
            where: { agent: { ownerUserId: userB.id } },
        });
        await prisma_1.prisma.agent.deleteMany({
            where: { ownerUserId: { in: [userA.id, userB.id] } },
        });
        await prisma_1.prisma.thread.deleteMany({
            where: { userId: { in: [userA.id, userB.id] } },
        });
        await prisma_1.prisma.user.deleteMany({
            where: { id: { in: [userA.id, userB.id] } },
        });
        await prisma_1.prisma.$disconnect();
    }
}
main()
    .then(() => console.log("AGENT INTERACTION TEST PASSED"))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
