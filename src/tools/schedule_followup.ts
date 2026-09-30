import { Queue } from "bullmq";
import { prisma } from "../infrastructure/prisma";

const queue = new Queue("shauri-followups", { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });
export async function scheduleFollowup(input: { threadId: string; runAt: Date; promptContext: string }) {
  const idempotencyKey = `thread:${input.threadId}:followup:${input.runAt.toISOString()}:${input.promptContext.slice(0, 80)}`;
  const existing = await prisma.scheduledFollowup.findUnique({ where: { idempotencyKey } });
  if (existing) return { jobId: existing.id };
  const record = await prisma.scheduledFollowup.create({ data: { threadId: input.threadId, runAt: input.runAt, promptContext: input.promptContext, idempotencyKey } });
  const job = await queue.add("send-followup", { followupId: record.id, threadId: input.threadId }, { jobId: record.id, delay: Math.max(input.runAt.getTime() - Date.now(), 0), removeOnComplete: 1000, removeOnFail: 1000 });
  return { jobId: job.id ?? record.id };
}
