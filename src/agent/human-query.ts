/**
 * Human Query Lifecycle
 * ---------------------
 *
 * Owns the lifecycle of human-provided information inside Shauri.
 *
 * A HumanQuery has an explicit authority:
 *
 *   USER
 *     The user's next WhatsApp message may answer the query.
 *
 *   OPERATOR
 *     Only an operator may answer the query.
 *
 * Lifecycle:
 *
 *   createHumanQuery()
 *          ↓
 *   Thread paused
 *          ↓
 *   HumanQuery OPEN
 *          ↓
 *   answerHumanQuery()
 *          ↓
 *   HumanQuery ANSWERED
 *          ↓
 *   KnowledgeCandidate created
 *          ↓
 *   Thread resumed at GROUND
 *
 * Operator-specific lifecycle:
 *
 *   operator answer
 *          ↓
 *   answerHumanQuery()
 *          ↓
 *   notify user
 *          ↓
 *   runShauriGraph()
 *          ↓
 *   send Shauri response
 *
 * This module does NOT decide when Shauri needs human information.
 * The graph decides that and calls createHumanQuery().
 */

import { HumanQuerySource } from "@prisma/client";

import { prisma } from "../infrastructure/prisma";
import { notifyOperatorOfHumanQuery } from "./operator-notification";
import { threadState } from "../domain/thread";

export type HumanQuerySourceInput = "USER" | "OPERATOR";

/**
 * Input required to create a HumanQuery.
 */
export type CreateHumanQueryInput = {
  userId: string;
  threadId: string;

  /** Short description of the decision matter. */
  matter: string;

  /** Question presented to the authoritative human. */
  question: string;

  /** Context persisted for audit/operator reasoning. */
  knownContext: string;

  /** Why Shauri needs human information. */
  reason: string;

  /**
   * Who is authoritative for answering the query.
   *
   * Defaults to USER for backwards compatibility with existing
   * graph call sites.
   */
  source?: HumanQuerySourceInput;
};

/**
 * Dependencies required by the operator-resume path.
 *
 * These are injectable so lifecycle tests do not require:
 *
 * - WhatsApp credentials
 * - a live LangGraph/model runtime
 * - external services
 */
export type OperatorResumeDependencies = {
  sendUserMessage: (
    userId: string,
    phone: string,
    message: string,
  ) => Promise<{ channel: string }>;

  runShauriGraph: (input: {
    threadId: string;
    userId: string;
    rawInput: string;
    injectedContext?: string;
  }) => Promise<{
    reply: string;
    awaitingReply: boolean;
  }>;

  buildInjectedContext: (
    userId: string,
    input: string,
  ) => Promise<string>;
};

/**
 * Create an OPEN HumanQuery.
 *
 * Creation is idempotent for a thread:
 *
 *   If an OPEN HumanQuery already exists for the thread,
 *   return it rather than creating a duplicate.
 *
 * The thread state machine owns the actual pause transition.
 */
export async function createHumanQuery(
  input: CreateHumanQueryInput,
) {
  const open = await prisma.humanQuery.findFirst({
    where: {
      threadId: input.threadId,
      status: "OPEN",
    },
  });

  if (open) {
    return open;
  }

  const source =
    input.source === "OPERATOR"
      ? HumanQuerySource.OPERATOR
      : HumanQuerySource.USER;

  const q = await prisma.humanQuery.create({
    data: {
      userId: input.userId,
      threadId: input.threadId,
      matter: input.matter,
      question: input.question,
      knownContext: input.knownContext,
      reason: input.reason,
      source,
    },
  });

  /*
   * Record the question in the HumanQuery audit trail.
   */
  await prisma.humanQueryMessage.create({
    data: {
      humanQueryId: q.id,
      direction: "SYSTEM",
      content: input.question,
    },
  });

  /*
   * Pause the thread and explicitly record who owns the answer.
   */
  await threadState.transition(
    input.threadId,
    "pause_human",
    "GROUND",
    source,
  );

  if (source === HumanQuerySource.OPERATOR) {
    await notifyOperatorOfHumanQuery(q.id);
  }

  return q;
}

/**
 * Answer a HumanQuery.
 *
 * This function handles persistence and state transition only.
 *
 * It does NOT invoke the LangGraph.
 *
 * USER path:
 *   runShauriGraph() handles the incoming user message.
 *
 * OPERATOR path:
 *   resumeHumanQueryFromOperator() performs the full handoff.
 *
 * Guarantees:
 *
 * - Empty answers are rejected.
 * - Only one answer can win a race.
 * - Re-posting an already ANSWERED id is rejected.
 * - Exactly one KnowledgeCandidate is created on first answer.
 * - The answer is added to Thread.known.
 * - awaitingHuman becomes false.
 * - awaitingSource becomes NONE.
 * - currentPass becomes GROUND.
 */
export async function answerHumanQuery(
  id: string,
  answer: string,
) {
  const cleanAnswer = answer.trim();

  if (!cleanAnswer) {
    throw new Error("Human answer cannot be empty");
  }

  const q = await prisma.humanQuery.findUniqueOrThrow({
    where: { id },
  });

  if (q.status !== "OPEN") {
    throw new Error(
      `Human query ${id} is already ${q.status}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    /*
     * Optimistic concurrency protection.
     *
     * Only the first transaction that changes OPEN → ANSWERED
     * is allowed to continue.
     */
    const claimed = await tx.humanQuery.updateMany({
      where: {
        id,
        status: "OPEN",
      },
      data: {
        status: "ANSWERED",
        answer: cleanAnswer,
        answeredAt: new Date(),
      },
    });

    if (claimed.count !== 1) {
      // Race: another writer won — return current row.
      return tx.humanQuery.findUniqueOrThrow({ where: { id } });
    }

    /*
     * Preserve the answer in the HumanQuery conversation history.
     */
    await tx.humanQueryMessage.create({
      data: {
        humanQueryId: id,
        direction: "IN",
        content: cleanAnswer,
      },
    });

    /*
     * Store the answer as reusable human-provided knowledge.
     */
    await tx.knowledgeCandidate.create({
      data: {
        userId: q.userId,
        threadId: q.threadId,
        proposition: cleanAnswer,
        evidence: {
          source: "human",
          humanQueryId: q.id,
          humanQuerySource: q.source,
        },
      },
    });

    const thread = await tx.thread.findUniqueOrThrow({
      where: {
        id: q.threadId,
      },
    });

    /*
     * Preserve the existing known facts and append the human evidence.
     *
     * Set semantics prevent the same evidence from being added twice
     * if the surrounding lifecycle is retried.
     */
    const known = Array.from(
      new Set([
        ...thread.known,
        `Human-provided evidence: ${cleanAnswer}`,
      ]),
    );

    /*
     * The human query has now been answered.
     *
     * Therefore:
     *
     *   awaitingHuman  = false
     *   awaitingSource = NONE
     *   awaitingReply  = false
     *   currentPass    = GROUND
     *
     * The graph can subsequently resume from GROUND.
     */
    await tx.thread.update({
      where: {
        id: q.threadId,
      },
      data: {
        awaitingHuman: false,
        awaitingReply: false,
        awaitingSource: HumanQuerySource.NONE,
        currentPass: "GROUND",
        known,
      },
    });

    return tx.humanQuery.findUniqueOrThrow({
      where: {
        id,
      },
    });
  });
}

/**
 * Resolve the runtime dependencies for operator resume.
 *
 * Lazy imports are intentional because:
 *
 *   graph.ts
 *       ↓
 *   human-query.ts
 *       ↓
 *   graph.ts
 *
 * would otherwise create a circular module initialization problem.
 */
async function getOperatorResumeDependencies(): Promise<
  OperatorResumeDependencies
> {
  const { runShauriGraph } = await import("./graph");
  const { buildInjectedContext } = await import("./context");
  const { sendUserMessage } = await import("../messaging/send-user-message");

  return {
    sendUserMessage,
    runShauriGraph,
    buildInjectedContext,
  };
}

/**
 * Complete operator → user → Shauri resume lifecycle.
 *
 * Flow:
 *
 *   Operator answers
 *          ↓
 *   answerHumanQuery()
 *          ↓
 *   HumanQuery = ANSWERED
 *          ↓
 *   KnowledgeCandidate created
 *          ↓
 *   Thread = GROUND
 *          ↓
 *   Operator answer sent to user
 *          ↓
 *   Shauri graph resumes
 *          ↓
 *   Shauri response sent to user
 */
export async function resumeHumanQueryFromOperator(
  id: string,
  answer: string,
  injectedDependencies?: OperatorResumeDependencies,
) {
  /*
   * Persist the answer and unblock the thread first.
   */
  const q = await answerHumanQuery(id, answer);

  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id: q.userId,
    },
  });

  /*
   * Production uses the real dependencies.
   * Tests can inject fakes.
   */
  const dependencies =
    injectedDependencies ??
    (await getOperatorResumeDependencies());

  /*
   * Step 1:
   *
   * Tell the user that the operator has answered.
   */
  const answerDelivery = await dependencies.sendUserMessage(
    user.id,
    user.phone,
    answer,
  );

  /*
   * Persist the operator answer as an outbound user-visible message.
   */
  await prisma.message.create({
    data: {
      threadId: q.threadId,
      direction: "OUT",
      content: answer,
      channel: answerDelivery.channel,
      metadata: {
        source: "human_operator",
        humanQueryId: q.id,
      },
    },
  });

  /*
   * Step 2:
   *
   * Build context containing the operator answer.
   *
   * answerHumanQuery() has already persisted the evidence into
   * Thread.known. The injected context provides additional runtime
   * context for the graph.
   */
  const injectedContext =
    await dependencies.buildInjectedContext(
      q.userId,
      answer,
    );

  /*
   * Step 3:
   *
   * Resume Shauri from the GROUND pass.
   */
  const result =
    await dependencies.runShauriGraph({
      threadId: q.threadId,
      userId: q.userId,
      rawInput: answer,
      injectedContext,
    });

  /*
   * Step 4:
   *
   * Persist Shauri's response.
   */
  const replyDelivery = await dependencies.sendUserMessage(
    user.id,
    user.phone,
    result.reply,
  );

  await prisma.message.create({
    data: {
      threadId: q.threadId,
      direction: "OUT",
      content: result.reply,
      channel: replyDelivery.channel,
      metadata: {
        source: "shauri_resume",
        humanQueryId: q.id,
      },
    },
  });

  /*
   * Step 5:
   *
   * Deliver Shauri's response to the user.
   */
  return {
    query: q,
    reply: result.reply,
    awaitingReply: result.awaitingReply,
  };
}