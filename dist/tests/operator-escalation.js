"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/infrastructure/prisma");
const operator_escalation_1 = require("../src/agent/operator-escalation");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function main() {
    const runId = `${process.pid}-${Date.now()}`;
    const user = await prisma_1.prisma.user.create({
        data: { phone: `+2547${Date.now().toString().slice(-8)}` },
    });
    let threadId;
    let escalationId;
    try {
        const thread = await prisma_1.prisma.thread.create({
            data: {
                userId: user.id,
                status: "ESCALATED",
                decisionSummary: "Restore access to the user's account.",
                known: ["The user cannot access their account."],
            },
        });
        threadId = thread.id;
        await prisma_1.prisma.decisionRecord.create({
            data: {
                userId: user.id,
                threadId: thread.id,
                matter: "Restore account access",
                status: "ESCALATED",
            },
        });
        const escalation = await prisma_1.prisma.escalation.create({
            data: {
                userId: user.id,
                threadId: thread.id,
                reason: "Requires authorized account access.",
            },
        });
        escalationId = escalation.id;
        const telegramChatId = `operator-escalation-test-${runId}`;
        await prisma_1.prisma.channelIdentity.create({
            data: {
                userId: user.id,
                channel: "telegram",
                externalId: telegramChatId,
            },
        });
        const sent = [];
        const sentCount = () => sent.length;
        const senders = {
            whatsapp: async (recipient, message) => {
                sent.push({ channel: "whatsapp", recipient, message });
            },
            telegram: async (recipient, message) => {
                sent.push({ channel: "telegram", recipient, message });
            },
        };
        await (0, operator_escalation_1.addEscalationNote)(escalation.id, "Confirmed account ownership in the support console.");
        let deliveryFailureSurfaced = false;
        try {
            await (0, operator_escalation_1.sendEscalationUpdate)(escalation.id, "This message should fail.", {
                whatsapp: async () => {
                    throw new Error("test delivery failure");
                },
                telegram: async () => {
                    throw new Error("test delivery failure");
                },
            });
        }
        catch (error) {
            deliveryFailureSurfaced =
                error instanceof Error &&
                    error.message === "test delivery failure";
        }
        const afterFailure = await prisma_1.prisma.escalation.findUniqueOrThrow({
            where: { id: escalation.id },
            include: { messages: true },
        });
        assert(deliveryFailureSurfaced &&
            afterFailure.status === "OPEN" &&
            !afterFailure.messages.some((entry) => entry.content === "This message should fail."), "Failed delivery must remain visible and must not resolve or log a successful user message.");
        await (0, operator_escalation_1.sendEscalationUpdate)(escalation.id, "We confirmed your account and are restoring access.", senders);
        assert(sentCount() === 1 &&
            sent[0].channel === "telegram" &&
            sent[0].recipient === telegramChatId &&
            sent[0].message === "We confirmed your account and are restoring access.", "User updates should go to the user's active Telegram identity.");
        const resolved = await (0, operator_escalation_1.resolveEscalation)(escalation.id, "Restored account access after verifying ownership.", "Your account access has been restored. Please try signing in again.", senders);
        assert(resolved.status === "RESOLVED", "Resolution should close the escalation.");
        assert(sentCount() === 2 &&
            sent[1].channel === "telegram" &&
            sent[1].recipient === telegramChatId &&
            sent[1].message ===
                "Your account access has been restored. Please try signing in again.", "The resolution message should be delivered to the user's active channel.");
        const [activity, outboundMessages, updatedThread, updatedDecision] = await Promise.all([
            prisma_1.prisma.escalationMessage.findMany({
                where: { escalationId: escalation.id },
                orderBy: { createdAt: "asc" },
            }),
            prisma_1.prisma.message.findMany({
                where: { threadId: thread.id, direction: "OUT" },
                orderBy: { createdAt: "asc" },
            }),
            prisma_1.prisma.thread.findUniqueOrThrow({ where: { id: thread.id } }),
            prisma_1.prisma.decisionRecord.findUniqueOrThrow({
                where: { threadId: thread.id },
            }),
        ]);
        assert(activity.some((entry) => entry.direction === "IN" &&
            entry.content ===
                "Confirmed account ownership in the support console."), "Internal operator notes should be recorded in the case work log.");
        assert(activity.some((entry) => entry.direction === "OUT" &&
            entry.content ===
                "We confirmed your account and are restoring access.") &&
            activity.some((entry) => entry.direction === "OUT" &&
                entry.content ===
                    "Your account access has been restored. Please try signing in again."), "Updates and resolution messages should be recorded in case activity.");
        assert(outboundMessages.length === 2 &&
            outboundMessages.every((entry) => entry.channel === "telegram"), "User-facing escalation messages should appear in the thread transcript with their delivery channel.");
        assert(updatedThread.status === "OPEN" &&
            !updatedThread.awaitingHuman &&
            updatedDecision.status === "OPEN", "Resolving an escalation should reopen the decision thread and record.");
        let duplicateRejected = false;
        try {
            await (0, operator_escalation_1.resolveEscalation)(escalation.id, "Duplicate resolution");
        }
        catch (error) {
            duplicateRejected =
                error instanceof Error &&
                    error.message === "Escalation is no longer open";
        }
        assert(duplicateRejected, "An already resolved escalation must not be resolved twice.");
        console.log("✓ internal escalation notes are auditable");
        console.log("✓ user updates and resolution follow the active channel");
        console.log("✓ delivery failure leaves escalation open and unlogged as sent");
        console.log("✓ user messages appear in the thread transcript");
        console.log("✓ resolution reopens the thread and rejects duplicate resolution");
        console.log("OPERATOR ESCALATION TEST PASSED");
    }
    finally {
        if (escalationId) {
            await prisma_1.prisma.escalationMessage.deleteMany({
                where: { escalationId },
            });
            await prisma_1.prisma.operatorNotification.deleteMany({
                where: { escalationId },
            });
            await prisma_1.prisma.escalation.deleteMany({
                where: { id: escalationId },
            });
        }
        if (threadId) {
            await prisma_1.prisma.message.deleteMany({ where: { threadId } });
            await prisma_1.prisma.decisionRecord.deleteMany({ where: { threadId } });
            await prisma_1.prisma.thread.deleteMany({ where: { id: threadId } });
        }
        await prisma_1.prisma.user.delete({ where: { id: user.id } });
        await prisma_1.prisma.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
