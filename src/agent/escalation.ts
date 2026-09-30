import { prisma } from "../infrastructure/prisma";
import { threadState } from "../domain/thread";

export async function notifyEscalation(params: { threadId: string; userId: string; userPhone: string; reason: string }) {
  const existing = await prisma.escalation.findFirst({ where: { threadId: params.threadId, status: "OPEN" } });
  const escalation = existing ?? await prisma.escalation.create({ data: { userId: params.userId, threadId: params.threadId, reason: params.reason, messages: { create: { direction: "SYSTEM", content: params.reason } } } });
  if (!existing) await threadState.transition(params.threadId, "escalate", "CLOSE");
  console.warn(`[ESCALATION] ${params.threadId} ${params.userPhone}: ${params.reason}`);
  return escalation;
}
