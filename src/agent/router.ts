/**
 * Lightweight intent router for inbound text.
 *
 * Responsibilities:
 * - Classify the inbound message.
 * - Detect an obvious USER-authority continuation.
 * - Never allow an ordinary user message to answer an OPERATOR-owned
 *   HumanQuery.
 *
 * Thread identity is primarily owned by thread-resolver.ts.
 *
 * HumanQuery authority:
 *
 *   USER
 *     The user's message may satisfy the query when the thread is
 *     explicitly waiting for the user.
 *
 *   OPERATOR
 *     The user's message must NOT satisfy the query.
 *     Only the operator-resume lifecycle may answer it.
 *
 * finance_query is reserved for account/balance/transaction reads.
 * Investment, SACCO, loan, job, and other "should I..." decisions enter
 * the Shauri decision graph.
 */

import {
  HumanQuerySource,
  ThreadStatus,
} from "@prisma/client";

import { prisma } from "../infrastructure/prisma";
import { getFastModel } from "./model";

const getModel = () => getFastModel(0);

export type Intent =
  | "shauri_new"
  | "shauri_continue"
  | "task_create"
  | "note_create"
  | "finance_query"
  | "escalation_request"
  | "unclear";

export interface RouteResult {
  intent: Intent;
  threadId?: string;
  extracted?: string;
}

function stripFences(raw: unknown): string {
  let value = String(raw ?? "").trim();

  if (value.startsWith("```")) {
    value = value
      .replace(/^```(?:json|JSON)?\s*/i, "")
      .replace(/\s*```$/i, "");
  }

  return value.trim();
}

function parseRoute(value: unknown): RouteResult {
  try {
    const text =
      typeof value === "string"
        ? stripFences(value)
        : JSON.stringify(value);

    const parsed = JSON.parse(text) as {
      intent?: string;
      extracted?: string;
    };

    const allowed: Intent[] = [
      "shauri_new",
      "shauri_continue",
      "task_create",
      "note_create",
      "finance_query",
      "escalation_request",
      "unclear",
    ];

    const intent = allowed.includes(parsed.intent as Intent)
      ? (parsed.intent as Intent)
      : "unclear";

    return {
      intent,
      extracted:
        typeof parsed.extracted === "string"
          ? parsed.extracted.trim()
          : undefined,
    };
  } catch {
    return {
      intent: "unclear",
    };
  }
}

/**
 * Find threads where the USER is actually expected to provide
 * information.
 *
 * OPERATOR-owned HumanQueries are deliberately excluded.
 */
async function findUserAwaitingThreads(userId: string) {
  return prisma.thread.findMany({
    where: {
      userId,
      status: ThreadStatus.OPEN,

      OR: [
        {
          awaitingReply: true,
        },
        {
          pendingCloseConfirmation: true,
        },
        {
          awaitingHuman: true,
          awaitingSource: HumanQuerySource.USER,
        },
      ],
    },

    orderBy: {
      updatedAt: "desc",
    },

    take: 8,

    select: {
      id: true,
      awaitingReply: true,
      pendingCloseConfirmation: true,
      awaitingHuman: true,
      awaitingSource: true,
    },
  });
}

/**
 * Route an inbound user message.
 *
 * This function deliberately does NOT select among arbitrary open
 * threads. That responsibility belongs to resolveThread().
 */
export async function routeMessage(
  userId: string,
  text: string,
): Promise<RouteResult> {
  /*
   * ---------------------------------------------------------------
   * 1. Deterministic USER continuation
   * ---------------------------------------------------------------
   *
   * If exactly one thread explicitly expects a user response,
   * the message belongs there.
   *
   * This avoids asking an LLM to make an unnecessary decision.
   */
  const awaitingUser = await findUserAwaitingThreads(userId);

  if (awaitingUser.length === 1) {
    return {
      intent: "shauri_continue",
      threadId: awaitingUser[0].id,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 2. General intent classification
   * ---------------------------------------------------------------
   *
   * If there is no single deterministic USER continuation,
   * classify the message.
   *
   * Thread selection itself is handled later by resolveThread().
   */
  const response = await getModel().invoke([
    {
      role: "system",
      content: [
        'Respond only JSON: {"intent":"shauri_new|shauri_continue|task_create|note_create|finance_query|escalation_request|unclear","extracted":""}.',

        "",

        "Intent rules:",

        '- finance_query = ONLY requests to read balances, transactions, statements, or linked accounts.',

        '- shauri_new = a decision, choice, tradeoff, or "should I..." matter.',

        '- shauri_continue = clearly continues an existing Shauri matter.',

        '- task_create = explicit request to create/save a task or todo.',

        '- note_create = explicit request to save a note.',

        '- escalation_request = explicit request for a human, operator, staff member, or real person.',

        '- unclear = cannot classify confidently.',

        "",

        "Important:",

        "- Never use finance_query for investment advice.",

        "- Never use finance_query for SACCO decisions.",

        "- Never use finance_query for loan decisions.",

        "- Never use finance_query for savings or investment allocation.",

        "- Never use finance_query for general financial decision support.",

        "",

        "Thread rules:",

        "- Do not invent an existing thread.",

        "- Do not assume the newest thread is the correct thread.",

        "- Thread identity will be resolved separately.",

        "- An OPERATOR-owned HumanQuery cannot be answered by an ordinary user message.",

        "- If a matter requires an operator, the operator lifecycle must answer it.",
      ].join("\n"),
    },

    {
      role: "user",
      content: text,
    },
  ]);

  return parseRoute(response.content);
}