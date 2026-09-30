import { prisma } from "../infrastructure/prisma";
export async function promoteHumanAnswerToCandidate(input: { userId: string; threadId: string; proposition: string; evidence?: unknown }) {
  return prisma.knowledgeCandidate.create({ data: { userId: input.userId, threadId: input.threadId, proposition: input.proposition, evidence: input.evidence as any } });
}
