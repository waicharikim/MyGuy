import { prisma } from "../infrastructure/prisma";

const operatorThreadSelect = {
  id: true,
  status: true,
  decisionSummary: true,
  known: true,
  open: true,
  leaning: true,
  skepticArgument: true,
  user: {
    select: {
      phone: true,
      profile: {
        select: {
          summary: true,
          values: true,
          recurringConcerns: true,
        },
      },
    },
  },
  decisionRecords: {
    select: {
      matter: true,
      status: true,
      decisionSummary: true,
      goal: true,
      recommendedOption: true,
      confidence: true,
      risks: true,
      assumptions: true,
      unresolvedQuestions: true,
      evidenceRefs: true,
      humanInputs: true,
      escalationReason: true,
      updatedAt: true,
    },
  },
  groundingEvidence: {
    orderBy: { retrievedAt: "desc" as const },
    take: 10,
    select: {
      claim: true,
      sourceUrl: true,
      sourceTitle: true,
      finding: true,
      confidence: true,
    },
  },
  messages: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    select: {
      direction: true,
      channel: true,
      content: true,
      createdAt: true,
    },
  },
};

export async function getOperatorQueue() {
  const [queries, escalations] = await Promise.all([
    prisma.humanQuery.findMany({
      where: {
        status: "OPEN",
        source: "OPERATOR",
      },
      orderBy: { createdAt: "asc" },
      include: {
        operatorNotification: {
          select: { id: true, attempts: true, lastError: true, sentAt: true },
        },
        thread: { select: operatorThreadSelect },
      },
    }),
    prisma.escalation.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      include: {
        operatorNotification: {
          select: { id: true, attempts: true, lastError: true, sentAt: true },
        },
        thread: { select: operatorThreadSelect },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            direction: true,
            content: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            phone: true,
            profile: {
              select: {
                summary: true,
                values: true,
                recurringConcerns: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    humanQueries: queries.map((query) => ({
      id: query.id,
      createdAt: query.createdAt,
      matter: query.matter,
      question: query.question,
      reason: query.reason,
      knownContext: query.knownContext,
      source: query.source,
      status: query.status,
      operatorNotification: query.operatorNotification,
      thread: {
        ...query.thread,
        messages: [...query.thread.messages].reverse(),
      },
    })),
    escalations: escalations.map((escalation) => ({
      id: escalation.id,
      createdAt: escalation.createdAt,
      matter:
        escalation.thread.decisionRecords[0]?.matter ||
        escalation.thread.decisionSummary ||
        escalation.thread.id,
      reason: escalation.reason,
      operatorNotification: escalation.operatorNotification,
      messages: escalation.messages,
      user: escalation.user,
      thread: {
        ...escalation.thread,
        messages: [...escalation.thread.messages].reverse(),
      },
    })),
  };
}
