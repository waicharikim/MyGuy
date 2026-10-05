import {
  DecisionOutcomeSource,
  DecisionOutcomeStatus,
} from "@prisma/client";

import { prisma } from "../infrastructure/prisma";

export async function captureRequestedDecisionOutcome(
  threadId: string,
  notes: string,
) {
  const cleanNotes = notes.trim();
  if (!cleanNotes) {
    throw new Error("Decision outcome notes cannot be empty");
  }

  return prisma.$transaction(async (tx) => {
    const thread = await tx.thread.findUniqueOrThrow({
      where: { id: threadId },
      select: { outcomeRequestedAt: true },
    });

    if (!thread.outcomeRequestedAt) {
      throw new Error(`Thread ${threadId} has no pending outcome request`);
    }

    const now = new Date();
    const updated = await tx.thread.updateMany({
      where: {
        id: threadId,
        outcomeRequestedAt: thread.outcomeRequestedAt,
      },
      data: { outcomeRequestedAt: null },
    });

    if (updated.count !== 1) {
      throw new Error(`Outcome request for thread ${threadId} was already handled`);
    }

    return tx.decisionRecord.update({
      where: { threadId },
      data: {
        outcomeStatus: DecisionOutcomeStatus.UNCLEAR,
        outcomeNotes: cleanNotes,
        outcomeSource: DecisionOutcomeSource.USER,
        outcomeAt: now,
      },
    });
  });
}

export async function classifyDecisionOutcome(input: {
  threadId: string;
  status: DecisionOutcomeStatus;
  notes?: string;
}) {
  const notes = input.notes?.trim();

  return prisma.decisionRecord.update({
    where: { threadId: input.threadId },
    data: {
      outcomeStatus: input.status,
      ...(notes ? { outcomeClassificationNotes: notes } : {}),
      outcomeClassifiedAt: new Date(),
    },
  });
}

export async function listUnclassifiedDecisionOutcomes() {
  return prisma.decisionRecord.findMany({
    where: {
      outcomeStatus: DecisionOutcomeStatus.UNCLEAR,
      outcomeSource: DecisionOutcomeSource.USER,
    },
    orderBy: { outcomeAt: "asc" },
    take: 50,
    select: {
      threadId: true,
      userId: true,
      matter: true,
      decisionSummary: true,
      recommendedOption: true,
      outcomeNotes: true,
      outcomeAt: true,
      user: {
        select: { phone: true },
      },
    },
  });
}
