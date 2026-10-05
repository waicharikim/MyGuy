"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const prisma_1 = require("../infrastructure/prisma");
const send_1 = require("../whatsapp/send");
const escalation_1 = require("./escalation");
const profile_1 = require("./profile");
const MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS || 4);
const worker = new bullmq_1.Worker("shauri-followups", async (job) => {
    const { followupId, threadId } = job.data;
    const record = await prisma_1.prisma.scheduledFollowup.findUnique({ where: { id: followupId }, include: { thread: { include: { user: true } } } });
    if (!record || record.status !== "PENDING")
        return;
    await prisma_1.prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    const thread = record.thread;
    if (thread.status !== "OPEN") {
        await prisma_1.prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "CANCELLED" } });
        return;
    }
    if (thread.followupCount >= MAX_FOLLOWUPS) {
        await (0, escalation_1.notifyEscalation)({ threadId, userId: thread.userId, userPhone: thread.user.phone, reason: `Follow-up limit of ${MAX_FOLLOWUPS} reached without resolution.` });
        await prisma_1.prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "CANCELLED" } });
        await (0, profile_1.updateProfileFromThread)(thread.userId, threadId);
        return;
    }
    const text = `Following up on: ${record.promptContext}. How did it go? You can reply with what happened, including if you acted, it partly worked, did not work, or you decided not to proceed.`;
    await (0, send_1.sendWhatsappMessage)(thread.user.phone, text);
    await prisma_1.prisma.message.create({ data: { threadId, direction: "OUT", content: text, channel: "whatsapp" } });
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.thread.update({ where: { id: threadId }, data: { awaitingReply: true, outcomeRequestedAt: new Date(), currentPass: "CLOSE", followupCount: { increment: 1 } } }),
        prisma_1.prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "SENT", sentAt: new Date() } }),
    ]);
}, { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });
worker.on("failed", (job, err) => console.error(`Followup job ${job?.id} failed`, err));
exports.default = worker;
