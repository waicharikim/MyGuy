import { DecisionRecordStatus } from "@prisma/client";

import { prisma } from "../infrastructure/prisma";

export type DecisionRecordInput = {
  userId: string;
  threadId: string;
  matter?: string;
  status?: DecisionRecordStatus;
  decisionSummary?: string;
  goal?: string;
  recommendedOption?: string | null;
  confidence?: number | null;
  risks?: string[];
  assumptions?: string[];
  unresolvedQuestions?: string[];
  evidenceRefs?: string[];
  humanInputs?: string[];
  escalationReason?: string | null;
};

export async function upsertDecisionRecord(input: DecisionRecordInput) {
  const matter = input.matter?.trim() || "Decision matter";
  const recommendedOption =
    input.recommendedOption?.trim() || null;
  let confidence: number | null = null;

  if (input.confidence !== undefined && input.confidence !== null) {
    if (
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      throw new Error("Decision confidence must be between 0 and 1");
    }
    confidence = input.confidence;
  }

  if ((recommendedOption === null) !== (confidence === null)) {
    throw new Error(
      "Decision recommendation and confidence must either both be present or both be absent",
    );
  }

  const payload = {
    userId: input.userId,
    threadId: input.threadId,
    matter,
    status: input.status ?? DecisionRecordStatus.OPEN,
    decisionSummary: input.decisionSummary ?? "",
    goal: input.goal ?? "",
    recommendedOption,
    confidence,
    risks: Array.isArray(input.risks) ? input.risks.filter(Boolean) : [],
    assumptions: Array.isArray(input.assumptions) ? input.assumptions.filter(Boolean) : [],
    unresolvedQuestions: Array.isArray(input.unresolvedQuestions)
      ? input.unresolvedQuestions.filter(Boolean)
      : [],
    evidenceRefs: Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter(Boolean) : [],
    humanInputs: Array.isArray(input.humanInputs) ? input.humanInputs.filter(Boolean) : [],
    escalationReason: input.escalationReason ?? null,
  };

  return prisma.decisionRecord.upsert({
    where: { threadId: input.threadId },
    create: payload,
    update: payload,
  });
}

export async function ensureDecisionRecord(input: {
  userId: string;
  threadId: string;
  matter: string;
  goal: string;
  status: DecisionRecordStatus;
}) {
  await prisma.decisionRecord.createMany({
    data: [{
      userId: input.userId,
      threadId: input.threadId,
      matter: input.matter || "Decision matter",
      goal: input.goal,
      status: input.status,
    }],
    skipDuplicates: true,
  });
}

export async function updateDecisionRecordStatus(
  threadId: string,
  status: DecisionRecordStatus,
) {
  return prisma.decisionRecord.update({
    where: { threadId },
    data: { status },
  });
}
