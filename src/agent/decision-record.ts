import { DecisionRecordStatus } from "@prisma/client";

import { prisma } from "../infrastructure/prisma";

export type DecisionRecordInput = {
  userId: string;
  threadId: string;
  matter?: string;
  status?: DecisionRecordStatus;
  decisionSummary?: string;
  goal?: string;
  recommendedOption?: string;
  confidence?: number;
  risks?: string[];
  assumptions?: string[];
  evidenceRefs?: string[];
  humanInputs?: string[];
  escalationReason?: string | null;
};

export async function upsertDecisionRecord(input: DecisionRecordInput) {
  const matter = input.matter?.trim() || "Decision matter";

  const payload = {
    userId: input.userId,
    threadId: input.threadId,
    matter,
    status: input.status ?? DecisionRecordStatus.OPEN,
    decisionSummary: input.decisionSummary ?? "",
    goal: input.goal ?? "",
    recommendedOption: input.recommendedOption ?? "",
    confidence: Number.isFinite(input.confidence ?? 0) ? Number(input.confidence ?? 0) : 0,
    risks: Array.isArray(input.risks) ? input.risks.filter(Boolean) : [],
    assumptions: Array.isArray(input.assumptions) ? input.assumptions.filter(Boolean) : [],
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
