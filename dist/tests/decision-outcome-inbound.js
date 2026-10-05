"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const inbound_message_service_1 = require("../src/application/inbound-message.service");
const prisma_1 = require("../src/infrastructure/prisma");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function cleanup(userId, externalIds) {
    const threads = await prisma_1.prisma.thread.findMany({
        where: { userId },
        select: { id: true },
    });
    const threadIds = threads.map((thread) => thread.id);
    await prisma_1.prisma.inboundReceipt.deleteMany({
        where: {
            channel: "test",
            externalId: { in: externalIds },
        },
    });
    await prisma_1.prisma.message.deleteMany({
        where: { threadId: { in: threadIds } },
    });
    await prisma_1.prisma.decisionRecord.deleteMany({ where: { userId } });
    await prisma_1.prisma.thread.deleteMany({ where: { userId } });
    await prisma_1.prisma.userProfile.deleteMany({ where: { userId } });
    await prisma_1.prisma.user.delete({ where: { id: userId } });
}
async function main() {
    const runId = Date.now().toString();
    const singleIds = [`${runId}-single-1`, `${runId}-single-duplicate`];
    const multipleIds = [
        `${runId}-multiple-prompt`,
        `${runId}-multiple-choice`,
        `${runId}-multiple-report`,
    ];
    let singleUserId;
    let multipleUserId;
    try {
        const singleUser = await prisma_1.prisma.user.create({
            data: { phone: `254700${Date.now().toString().slice(-7)}` },
        });
        singleUserId = singleUser.id;
        const singleThread = await prisma_1.prisma.thread.create({
            data: {
                userId: singleUser.id,
                status: "OPEN",
                currentPass: "CLOSE",
                awaitingReply: true,
                outcomeRequestedAt: new Date(),
                decisionSummary: "Whether to accept the job offer",
            },
        });
        await prisma_1.prisma.decisionRecord.create({
            data: {
                userId: singleUser.id,
                threadId: singleThread.id,
                status: "OPEN",
                matter: "Whether to accept the job offer",
            },
        });
        const report = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone: singleUser.phone,
            text: "I accepted after confirming the start date.",
            externalId: singleIds[0],
            channel: "test",
        });
        assert(report.threadId === singleThread.id, "Inbound outcome should remain attached to its matter.");
        assert(report.reply?.includes("recorded what happened"), "User should receive an outcome acknowledgement.");
        assert(!report.duplicate, "First outcome reply must be processed normally.");
        const storedOutcome = await prisma_1.prisma.decisionRecord.findUniqueOrThrow({
            where: { threadId: singleThread.id },
        });
        assert(storedOutcome.outcomeNotes === "I accepted after confirming the start date.", "Inbound report should be stored verbatim.");
        assert(storedOutcome.outcomeSource === "USER", "Inbound report should be marked as user-provided.");
        const acknowledged = await prisma_1.prisma.message.findMany({
            where: { threadId: singleThread.id },
            orderBy: { createdAt: "asc" },
        });
        assert(acknowledged.length === 2, "Outcome input and acknowledgement should both be persisted.");
        assert(acknowledged[0].direction === "IN", "Outcome report should be persisted as inbound.");
        assert(acknowledged[0].externalId === singleIds[0], "Outcome report should retain inbound message idempotency metadata.");
        assert(acknowledged[1].direction === "OUT", "Acknowledgement should be persisted as outbound.");
        const afterReport = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: singleThread.id },
        });
        assert(afterReport.awaitingReply === false, "Capturing an outcome should clear the follow-up wait.");
        assert(afterReport.outcomeRequestedAt === null, "Outcome request should be consumed.");
        const checkpoints = await prisma_1.prisma.graphCheckpoint.count({
            where: { threadId: singleThread.id },
        });
        assert(checkpoints === 0, "Outcome report must stop before invoking the decision graph.");
        const duplicate = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone: singleUser.phone,
            text: "I accepted after confirming the start date.",
            externalId: singleIds[0],
            channel: "test",
        });
        assert(duplicate.duplicate, "Retry of the same inbound event should be recognized as a duplicate.");
        assert(duplicate.reply === null, "Duplicate inbound event must not receive another acknowledgement.");
        const multipleUser = await prisma_1.prisma.user.create({
            data: { phone: `254701${Date.now().toString().slice(-7)}` },
        });
        multipleUserId = multipleUser.id;
        const firstThread = await prisma_1.prisma.thread.create({
            data: {
                userId: multipleUser.id,
                outcomeRequestedAt: new Date(Date.now() - 1_000),
                decisionSummary: "Whether to take the new job",
            },
        });
        const secondThread = await prisma_1.prisma.thread.create({
            data: {
                userId: multipleUser.id,
                outcomeRequestedAt: new Date(),
                decisionSummary: "Whether to move to a new apartment",
            },
        });
        await prisma_1.prisma.decisionRecord.createMany({
            data: [
                {
                    userId: multipleUser.id,
                    threadId: firstThread.id,
                    status: "OPEN",
                    matter: "Whether to take the new job",
                },
                {
                    userId: multipleUser.id,
                    threadId: secondThread.id,
                    status: "OPEN",
                    matter: "Whether to move to a new apartment",
                },
            ],
        });
        const prompt = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone: multipleUser.phone,
            text: "It worked out.",
            externalId: multipleIds[0],
            channel: "test",
        });
        assert(prompt.threadId === null, "Ambiguous outcome report must not be attached to a matter.");
        assert(prompt.reply?.includes("Reply with a number"), "User should be asked to choose the follow-up matter.");
        const selected = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone: multipleUser.phone,
            text: "2",
            externalId: multipleIds[1],
            channel: "test",
        });
        assert(selected.threadId === secondThread.id, "Numbered choice should select the intended matter.");
        assert(selected.reply?.includes("What happened"), "After selection, ask for the actual outcome.");
        const finalReport = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone: multipleUser.phone,
            text: "The move went well and reduced my commute.",
            externalId: multipleIds[2],
            channel: "test",
        });
        assert(finalReport.threadId === secondThread.id, "Outcome should be recorded against the selected matter.");
        assert(finalReport.reply?.includes("recorded what happened"), "Selected matter outcome should be acknowledged.");
        const firstRecord = await prisma_1.prisma.decisionRecord.findUniqueOrThrow({
            where: { threadId: firstThread.id },
        });
        const secondRecord = await prisma_1.prisma.decisionRecord.findUniqueOrThrow({
            where: { threadId: secondThread.id },
        });
        assert(firstRecord.outcomeNotes === null, "Unselected matter outcome must remain untouched.");
        assert(secondRecord.outcomeNotes === "The move went well and reduced my commute.", "Reported outcome must be recorded only on the selected matter.");
        console.log("✓ inbound outcome is stored and acknowledged without running the graph");
        console.log("✓ inbound/outbound audit messages and follow-up state are persisted");
        console.log("✓ multiple pending outcomes require explicit selection before capture");
    }
    finally {
        if (singleUserId) {
            await cleanup(singleUserId, singleIds);
        }
        if (multipleUserId) {
            await cleanup(multipleUserId, multipleIds);
        }
        await prisma_1.prisma.$disconnect();
    }
}
main()
    .then(() => {
    console.log("DECISION OUTCOME INBOUND TEST PASSED");
    process.exit(0);
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
