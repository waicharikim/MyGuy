import { DecisionPass, ThreadStatus } from "@prisma/client";
import { prisma } from "../infrastructure/prisma";
import { threadState } from "../domain/thread";

export interface LogDecisionStateInput {
  threadId: string;
  known?: string[];
  open?: string[];
  status?: "OPEN" | "CLOSED" | "ESCALATED";
  awaitingReply?: boolean;
  awaitingHuman?: boolean;
  currentPass?: DecisionPass;
  pendingCloseConfirmation?: boolean;
  followupCount?: number;
  leaning?: string | null;
  skepticArgument?: string | null;
  decisionSummary?: string | null;
}

export async function logDecisionState(input: LogDecisionStateInput) {
  const current = await prisma.thread.findUniqueOrThrow({ where: { id: input.threadId } });
  if (input.known || input.open || input.leaning !== undefined || input.skepticArgument !== undefined || input.decisionSummary !== undefined) {
    await prisma.thread.update({ where: { id: input.threadId }, data: {
      ...(input.known ? { known: input.known } : {}), ...(input.open ? { open: input.open } : {}),
      ...(input.leaning !== undefined ? { leaning: input.leaning } : {}),
      ...(input.skepticArgument !== undefined ? { skepticArgument: input.skepticArgument } : {}),
      ...(input.decisionSummary !== undefined ? { decisionSummary: input.decisionSummary } : {}),
    }});
  }
  if (input.status === "CLOSED") await threadState.transition(input.threadId, "close", input.currentPass);
  else if (input.status === "ESCALATED") await threadState.transition(input.threadId, "escalate", input.currentPass);
  else if (input.status === "OPEN" && current.status !== ThreadStatus.OPEN) await threadState.transition(input.threadId, "reopen", input.currentPass);
  else if (input.currentPass) await threadState.transition(input.threadId, "advance", input.currentPass);

  return prisma.thread.update({ where: { id: input.threadId }, data: {
    ...(input.awaitingReply !== undefined ? { awaitingReply: input.awaitingReply } : {}),
    ...(input.awaitingHuman !== undefined ? { awaitingHuman: input.awaitingHuman } : {}),
    ...(input.pendingCloseConfirmation !== undefined ? { pendingCloseConfirmation: input.pendingCloseConfirmation } : {}),
    ...(input.followupCount !== undefined ? { followupCount: input.followupCount } : {}),
  }});
}
