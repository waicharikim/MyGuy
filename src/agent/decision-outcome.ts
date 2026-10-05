import {
  DecisionRecordStatus,
  DecisionOutcomeSource,
  DecisionOutcomeStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "../infrastructure/prisma";

async function syncOutcomeToProfile(
  tx: Prisma.TransactionClient,
  record: {
    threadId: string;
    userId: string;
    matter: string;
    decisionSummary: string;
    recommendedOption: string;
    outcomeStatus: DecisionOutcomeStatus | null;
    outcomeNotes: string | null;
    outcomeSource: DecisionOutcomeSource | null;
    outcomeAt: Date | null;
    outcomeClassificationNotes: string | null;
    outcomeClassifiedAt: Date | null;
  },
) {
  const profile = await tx.userProfile.findUnique({
    where: { userId: record.userId },
    select: { pastDecisions: true },
  });

  const history = (profile?.pastDecisions ?? []).filter(
    (entry): entry is Prisma.JsonObject =>
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      entry.threadId !== record.threadId,
  );

  const entry: Prisma.JsonObject = {
    threadId: record.threadId,
    summary: record.matter || record.decisionSummary,
    recommendation: record.recommendedOption,
    outcomeStatus: record.outcomeStatus,
    outcomeReport: record.outcomeNotes,
    outcomeSource: record.outcomeSource,
    outcomeAt: record.outcomeAt?.toISOString() ?? null,
    classificationNotes: record.outcomeClassificationNotes,
    classifiedAt: record.outcomeClassifiedAt?.toISOString() ?? null,
  };

  history.push(entry);

  await tx.userProfile.upsert({
    where: { userId: record.userId },
    create: {
      userId: record.userId,
      pastDecisions: [entry],
    },
    update: {
      pastDecisions: history,
    },
  });
}

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

    const record = await tx.decisionRecord.update({
      where: { threadId },
      data: {
        outcomeStatus: DecisionOutcomeStatus.UNCLEAR,
        outcomeNotes: cleanNotes,
        outcomeSource: DecisionOutcomeSource.USER,
        outcomeAt: now,
      },
    });

    await syncOutcomeToProfile(tx, record);
    return record;
  });
}

export async function captureInboundDecisionOutcome(input: {
  threadId: string;
  text: string;
  channel: string;
  externalId?: string;
}) {
  const cleanNotes = input.text.trim();
  if (!cleanNotes) {
    throw new Error("Decision outcome notes cannot be empty");
  }

  const reply = "Thanks for the update. I’ve recorded what happened for this decision.";

  return prisma.$transaction(async (tx) => {
    if (input.externalId) {
      const existing = await tx.message.findFirst({
        where: {
          channel: input.channel,
          externalId: input.externalId,
        },
        select: { threadId: true },
      });

      if (existing) {
        return {
          duplicate: true,
          reply: null,
          threadId: existing.threadId,
        };
      }
    }

    const thread = await tx.thread.findUniqueOrThrow({
      where: { id: input.threadId },
      select: {
        userId: true,
        outcomeRequestedAt: true,
      },
    });

    if (!thread.outcomeRequestedAt) {
      throw new Error(`Thread ${input.threadId} has no pending outcome request`);
    }

    const now = new Date();
    const claimed = await tx.thread.updateMany({
      where: {
        id: input.threadId,
        outcomeRequestedAt: thread.outcomeRequestedAt,
      },
      data: {
        outcomeRequestedAt: null,
        outcomeSelectionPending: false,
        outcomeSelectedForReply: false,
        awaitingReply: false,
      },
    });

    if (claimed.count !== 1) {
      throw new Error(`Outcome request for thread ${input.threadId} was already handled`);
    }

    const record = await tx.decisionRecord.update({
      where: { threadId: input.threadId },
      data: {
        outcomeStatus: DecisionOutcomeStatus.UNCLEAR,
        outcomeNotes: cleanNotes,
        outcomeSource: DecisionOutcomeSource.USER,
        outcomeAt: now,
      },
    });

    await syncOutcomeToProfile(tx, record);

    await tx.message.create({
      data: {
        threadId: input.threadId,
        direction: "IN",
        channel: input.channel,
        externalId: input.externalId,
        content: input.text,
        metadata: { type: "decision_outcome_report" },
      },
    });

    await tx.message.create({
      data: {
        threadId: input.threadId,
        direction: "OUT",
        channel: input.channel,
        content: reply,
        metadata: { type: "decision_outcome_acknowledgement" },
      },
    });

    return {
      duplicate: false,
      reply,
      threadId: input.threadId,
    };
  });
}

export async function resolveOutcomeSelection(input: {
  userId: string;
  text: string;
  pendingThreadIds: string[];
  channel: string;
  externalId?: string;
}) {
  const selection = input.text.trim().match(/^([1-9]\d*)$/);
  if (!selection) {
    return null;
  }

  const selectedIndex = Number(selection[1]) - 1;
  const selectedThreadId = input.pendingThreadIds[selectedIndex];
  if (!selectedThreadId) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.thread.updateMany({
      where: {
        id: selectedThreadId,
        userId: input.userId,
        outcomeRequestedAt: { not: null },
        outcomeSelectionPending: true,
      },
      data: {
        outcomeSelectionPending: false,
        outcomeSelectedForReply: true,
      },
    });

    if (updated.count !== 1) {
      throw new Error("Outcome selection is no longer available");
    }

    await tx.thread.updateMany({
      where: {
        id: {
          in: input.pendingThreadIds,
          not: selectedThreadId,
        },
        userId: input.userId,
        outcomeRequestedAt: { not: null },
        outcomeSelectionPending: true,
        outcomeSelectedForReply: false,
      },
      data: { outcomeSelectionPending: false },
    });

    const thread = await tx.thread.findUniqueOrThrow({
      where: { id: selectedThreadId },
      select: {
        id: true,
        decisionSummary: true,
        known: true,
        open: true,
      },
    });

    const matter =
      thread.decisionSummary ||
      [...thread.known, ...thread.open].filter(Boolean).slice(0, 3).join("; ") ||
      "the selected matter";
    const reply = `Got it — ${matter}. What happened after you took the next step?`;

    await tx.message.create({
      data: {
        threadId: selectedThreadId,
        direction: "IN",
        channel: input.channel,
        externalId: input.externalId,
        content: input.text,
        metadata: { type: "decision_outcome_selection" },
      },
    });

    await tx.message.create({
      data: {
        threadId: selectedThreadId,
        direction: "OUT",
        channel: input.channel,
        content: reply,
        metadata: { type: "decision_outcome_selection_prompt" },
      },
    });

    return {
      threadId: thread.id,
      matter,
      reply,
    };
  });
}

export async function classifyDecisionOutcome(input: {
  threadId: string;
  status: DecisionOutcomeStatus;
  notes?: string;
}) {
  const notes = input.notes?.trim();

  return prisma.$transaction(async (tx) => {
    const record = await tx.decisionRecord.findUniqueOrThrow({
      where: { threadId: input.threadId },
    });

    if (
      record.outcomeSource !== DecisionOutcomeSource.USER ||
      record.outcomeAt === null
    ) {
      throw new Error(
        `Decision ${input.threadId} has no user-reported outcome to classify`,
      );
    }

    const classified = await tx.decisionRecord.update({
      where: { threadId: input.threadId },
      data: {
        outcomeStatus: input.status,
        ...(notes ? { outcomeClassificationNotes: notes } : {}),
        outcomeClassifiedAt: new Date(),
      },
    });

    await syncOutcomeToProfile(tx, classified);
    return classified;
  });
}

export async function listUnclassifiedDecisionOutcomes() {
  return prisma.decisionRecord.findMany({
    where: {
      outcomeStatus: DecisionOutcomeStatus.UNCLEAR,
      outcomeSource: DecisionOutcomeSource.USER,
      outcomeClassifiedAt: null,
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

export async function getDecisionQualityMetrics() {
  const [
    totalDecisionRecords,
    decisionsByStatus,
    outcomesByStatus,
    reportedOutcomeCount,
    reviewedOutcomeCount,
    pendingReviewCount,
    resolvedDecisionCount,
    resolvedWithOutcomeCount,
    actionableOutcomeCount,
    successfulOutcomeCount,
  ] = await Promise.all([
    prisma.decisionRecord.count(),
    prisma.decisionRecord.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.decisionRecord.groupBy({
      by: ["outcomeStatus"],
      where: { outcomeStatus: { not: null } },
      _count: { _all: true },
    }),
    prisma.decisionRecord.count({
      where: {
        outcomeSource: DecisionOutcomeSource.USER,
        outcomeAt: { not: null },
      },
    }),
    prisma.decisionRecord.count({
      where: { outcomeClassifiedAt: { not: null } },
    }),
    prisma.decisionRecord.count({
      where: {
        outcomeStatus: DecisionOutcomeStatus.UNCLEAR,
        outcomeSource: DecisionOutcomeSource.USER,
        outcomeClassifiedAt: null,
      },
    }),
    prisma.decisionRecord.count({
      where: { status: "RESOLVED" },
    }),
    prisma.decisionRecord.count({
      where: {
        status: "RESOLVED",
        outcomeAt: { not: null },
      },
    }),
    prisma.decisionRecord.count({
      where: {
        outcomeStatus: {
          in: [
            DecisionOutcomeStatus.SUCCESSFUL,
            DecisionOutcomeStatus.PARTIAL,
            DecisionOutcomeStatus.UNSUCCESSFUL,
          ],
        },
        outcomeClassifiedAt: { not: null },
      },
    }),
    prisma.decisionRecord.count({
      where: {
        outcomeStatus: DecisionOutcomeStatus.SUCCESSFUL,
        outcomeClassifiedAt: { not: null },
      },
    }),
  ]);

  const decisionStatusCounts: Record<DecisionRecordStatus, number> = {
    [DecisionRecordStatus.OPEN]: 0,
    [DecisionRecordStatus.AWAITING_HUMAN]: 0,
    [DecisionRecordStatus.RESOLVED]: 0,
    [DecisionRecordStatus.ESCALATED]: 0,
  };
  for (const group of decisionsByStatus) {
    decisionStatusCounts[group.status] = group._count._all;
  }

  const outcomeStatusCounts: Record<DecisionOutcomeStatus, number> = {
    [DecisionOutcomeStatus.SUCCESSFUL]: 0,
    [DecisionOutcomeStatus.PARTIAL]: 0,
    [DecisionOutcomeStatus.UNSUCCESSFUL]: 0,
    [DecisionOutcomeStatus.NO_ACTION]: 0,
    [DecisionOutcomeStatus.UNCLEAR]: 0,
  };
  for (const group of outcomesByStatus) {
    if (group.outcomeStatus) {
      outcomeStatusCounts[group.outcomeStatus] = group._count._all;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scope: "all_time",
    decisions: {
      total: totalDecisionRecords,
      byStatus: decisionStatusCounts,
      resolutionRate:
        totalDecisionRecords === 0
          ? null
          : resolvedDecisionCount / totalDecisionRecords,
    },
    outcomes: {
      userReported: reportedOutcomeCount,
      classified: reviewedOutcomeCount,
      pendingReview: pendingReviewCount,
      byStatus: outcomeStatusCounts,
      resolvedDecisionCoverage:
        resolvedDecisionCount === 0
          ? null
          : resolvedWithOutcomeCount / resolvedDecisionCount,
      successfulRateAmongClassifiedActions:
        actionableOutcomeCount === 0
          ? null
          : successfulOutcomeCount / actionableOutcomeCount,
      successfulRateDenominator: actionableOutcomeCount,
    },
  };
}
