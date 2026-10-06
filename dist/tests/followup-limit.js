"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/infrastructure/prisma");
const followup_limit_1 = require("../src/agent/followup-limit");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function main() {
    const user = await prisma_1.prisma.user.create({
        data: { phone: `+2547${Date.now().toString().slice(-8)}` },
    });
    let threadId;
    let followupId;
    try {
        const thread = await prisma_1.prisma.thread.create({
            data: {
                userId: user.id,
                status: "OPEN",
                awaitingReply: true,
                outcomeRequestedAt: new Date(),
                outcomeSelectionPending: true,
                outcomeSelectedForReply: true,
                followupCount: 4,
            },
        });
        threadId = thread.id;
        const followup = await prisma_1.prisma.scheduledFollowup.create({
            data: {
                threadId: thread.id,
                runAt: new Date(),
                promptContext: "Check whether the decision worked",
                idempotencyKey: `followup-limit-${thread.id}`,
                status: "PROCESSING",
            },
        });
        followupId = followup.id;
        await (0, followup_limit_1.stopFollowupsAtLimit)(followup.id, thread.id);
        const [updatedThread, updatedFollowup, escalationCount] = await Promise.all([
            prisma_1.prisma.thread.findUniqueOrThrow({ where: { id: thread.id } }),
            prisma_1.prisma.scheduledFollowup.findUniqueOrThrow({
                where: { id: followup.id },
            }),
            prisma_1.prisma.escalation.count({ where: { threadId: thread.id } }),
        ]);
        assert(updatedThread.status === "OPEN", "The unresolved decision should remain available for the user to resume.");
        assert(!updatedThread.awaitingReply, "The thread should stop waiting for a follow-up reply.");
        assert(updatedThread.outcomeRequestedAt === null, "Future messages should not be misclassified as a delayed outcome report.");
        assert(!updatedThread.outcomeSelectionPending && !updatedThread.outcomeSelectedForReply, "Outcome selection state should be cleared.");
        assert(updatedFollowup.status === "CANCELLED", "The exhausted follow-up should be cancelled.");
        assert(escalationCount === 0, "Silence after the follow-up limit should not create an operator escalation.");
        console.log("✓ follow-up limit stops reminders without paging an operator");
        console.log("✓ the user can resume the still-open decision later");
        console.log("FOLLOW-UP LIMIT TEST PASSED");
    }
    finally {
        if (followupId) {
            await prisma_1.prisma.scheduledFollowup.deleteMany({
                where: { id: followupId },
            });
        }
        if (threadId) {
            await prisma_1.prisma.thread.deleteMany({ where: { id: threadId } });
        }
        await prisma_1.prisma.user.delete({ where: { id: user.id } });
    }
}
main()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma_1.prisma.$disconnect();
});
