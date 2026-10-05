import { Worker } from "bullmq";
import { prisma } from "../infrastructure/prisma";
import { sendWhatsappMessage } from "../whatsapp/send";
import { notifyEscalation } from "./escalation";
import { updateProfileFromThread } from "./profile";

const MAX_FOLLOWUPS = Number(process.env.MAX_FOLLOWUPS || 4);
const worker = new Worker("shauri-followups", async job => {
  const { followupId, threadId } = job.data as { followupId: string; threadId: string };
  const record = await prisma.scheduledFollowup.findUnique({ where: { id: followupId }, include: { thread: { include: { user: true } } } });
  if (!record || record.status !== "PENDING") return;
  await prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
  const thread = record.thread;
  if (thread.status !== "OPEN") { await prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "CANCELLED" } }); return; }
  if (thread.followupCount >= MAX_FOLLOWUPS) {
    await notifyEscalation({ threadId, userId: thread.userId, userPhone: thread.user.phone, reason: `Follow-up limit of ${MAX_FOLLOWUPS} reached without resolution.` });
    await prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "CANCELLED" } });
    await updateProfileFromThread(thread.userId, threadId);
    return;
  }
  const text = `Following up on: ${record.promptContext}. How did it go? You can reply with what happened, including if you acted, it partly worked, did not work, or you decided not to proceed.`;
  await sendWhatsappMessage(thread.user.phone, text);
  await prisma.message.create({ data: { threadId, direction: "OUT", content: text, channel: "whatsapp" } });
  await prisma.$transaction([
    prisma.thread.update({ where: { id: threadId }, data: { awaitingReply: true, outcomeRequestedAt: new Date(), currentPass: "CLOSE", followupCount: { increment: 1 } } }),
    prisma.scheduledFollowup.update({ where: { id: followupId }, data: { status: "SENT", sentAt: new Date() } }),
  ]);
}, { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });
worker.on("failed", (job, err) => console.error(`Followup job ${job?.id} failed`, err));
export default worker;
