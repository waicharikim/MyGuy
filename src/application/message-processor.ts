/**
 * Application orchestration for one inbound user message.
 *
 * Pipeline:
 *
 * inbound-message.service
 *          ↓
 *      routeMessage()
 *          ↓
 *      resolveThread()
 *          ↓
 *      runShauriGraph()
 *
 * Responsibilities:
 *
 * - Execute non-Shauri intents.
 * - Resolve which decision matter receives a Shauri message.
 * - Persist inbound/outbound messages.
 * - Start/resume the decision graph.
 *
 * This module NEVER directly answers an OPERATOR HumanQuery.
 *
 * IMPORTANT:
 *
 * Thread ownership is determined by resolveThread().
 *
 * The router may classify a message as `shauri_continue`, but its
 * threadId is NOT authoritative. Otherwise the router could bypass
 * the thread resolver and attach an unrelated decision to an
 * existing thread.
 */

import { prisma } from "../infrastructure/prisma";

import { resolveThread } from "./thread-resolver";

import { createTask } from "../tools/create_task";
import { createNote } from "../tools/create_note";

import { notifyEscalation } from "../agent/escalation";
import { runShauriGraph } from "../agent/graph";
import { routeMessage } from "../agent/router";
import { buildInjectedContext } from "../agent/context";

import { initiateSTKPush } from "../tools/mpesa";
import {
  captureInboundDecisionOutcome,
  resolveOutcomeSelection,
} from "../agent/decision-outcome";

type ProcessMessageResult = {
  duplicate: boolean;
  reply: string | null;
  threadId: string | null;
};

export async function processMessage(
  input: {
    userId: string;
    phone: string;
    text: string;
    externalId?: string;
    channel: string;
  },
): Promise<ProcessMessageResult> {
  if (input.externalId) {
    const priorInbound =
      await prisma.message.findFirst({
        where: {
          channel: input.channel,
          externalId: input.externalId,
          direction: "IN",
        },
        select: { threadId: true },
      });

    if (priorInbound) {
      return {
        duplicate: true,
        reply: null,
        threadId: priorInbound.threadId,
      };
    }
  }

  const pendingOutcomes =
    await prisma.thread.findMany({
      where: {
        userId: input.userId,
        outcomeRequestedAt: { not: null },
      },
      orderBy: [
        { outcomeRequestedAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        outcomeSelectionPending: true,
        outcomeSelectedForReply: true,
        decisionSummary: true,
        known: true,
        open: true,
      },
    });

  const selectedOutcomes =
    pendingOutcomes.filter(
      (thread) => thread.outcomeSelectedForReply,
    );

  if (selectedOutcomes.length > 1) {
    throw new Error(
      `Multiple decision outcome threads selected for user ${input.userId}`,
    );
  }

  if (selectedOutcomes.length === 1) {
    return captureInboundDecisionOutcome({
      threadId: selectedOutcomes[0].id,
      text: input.text,
      channel: input.channel,
      externalId: input.externalId,
    });
  }

  if (pendingOutcomes.length === 1) {
    return captureInboundDecisionOutcome({
      threadId: pendingOutcomes[0].id,
      text: input.text,
      channel: input.channel,
      externalId: input.externalId,
    });
  }

  if (pendingOutcomes.length > 1) {
    const pendingIds = pendingOutcomes.map((thread) => thread.id);
    const selectionInProgress =
      pendingOutcomes.some(
        (thread) => thread.outcomeSelectionPending,
      );

    if (selectionInProgress) {
      const selection = await resolveOutcomeSelection({
        userId: input.userId,
        text: input.text,
        pendingThreadIds: pendingIds,
        channel: input.channel,
        externalId: input.externalId,
      });

      if (selection) {
        return {
          duplicate: false,
          reply: selection.reply,
          threadId: selection.threadId,
        };
      }
    } else {
      await prisma.thread.updateMany({
        where: { id: { in: pendingIds } },
        data: { outcomeSelectionPending: true },
      });
    }

    const choices = pendingOutcomes
      .map((thread, index) => {
        const matter =
          thread.decisionSummary ||
          [...thread.known, ...thread.open]
            .filter(Boolean)
            .slice(0, 3)
            .join("; ") ||
          "Decision matter";
        return `${index + 1}. ${matter}`;
      })
      .join("\n");

    return {
      duplicate: false,
      reply:
        `I have follow-ups on more than one decision. Which one is this about? Reply with a number:\n${choices}`,
      threadId: null,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 1. Intent classification
   * ---------------------------------------------------------------
   */

  const route = await routeMessage(
    input.userId,
    input.text,
  );

  /*
   * ---------------------------------------------------------------
   * 2. Tool-only intents
   * ---------------------------------------------------------------
   */

  if (route.intent === "task_create") {
    await createTask({
      userId: input.userId,
      description:
        route.extracted || input.text,
    });

    return {
      duplicate: false,
      reply:
        `Task saved: "${route.extracted || input.text}"`,
      threadId: null,
    };
  }

  if (route.intent === "note_create") {
    await createNote({
      userId: input.userId,
      content:
        route.extracted || input.text,
    });

    return {
      duplicate: false,
      reply: "Noted.",
      threadId: null,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 3. Account-read finance intent
   * ---------------------------------------------------------------
   */

  if (route.intent === "finance_query") {
    return {
      duplicate: false,
      reply:
        "I can’t read linked accounts yet. If you’re choosing what to do with money (invest, SACCO, loan, save), tell me the options and I’ll work the decision with you.",
      threadId: null,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 4. Explicit escalation
   * ---------------------------------------------------------------
   *
   * Escalation still needs to identify the matter that the user
   * wants to escalate.
   *
   * Thread resolution is therefore used here as well.
   */

  if (route.intent === "escalation_request") {
    const resolution =
      await resolveThread(
        input.userId,
        input.text,
      );

    if (resolution.type === "existing") {
      await notifyEscalation({
        threadId:
          resolution.threadId,
        userId:
          input.userId,
        userPhone:
          input.phone,
        reason:
          `User requested a human: ${input.text}`,
      });

      return {
        duplicate: false,
        reply:
          "Got it — I’m flagging this for a real person. The matter will stay open while they respond.",
        threadId:
          resolution.threadId,
      };
    }

    if (resolution.type === "ambiguous") {
      const lines =
        resolution.candidates
          .map(
            (candidate, index) =>
              `${index + 1}. ${candidate.summary}`,
          )
          .join("\n");

      return {
        duplicate: false,
        reply:
          `I have more than one open matter this could refer to. ` +
          `Which one do you mean?\n${lines}`,
        threadId: null,
      };
    }

    return {
      duplicate: false,
      reply:
        "I can flag an open matter for a person, but I need to know which matter you mean.",
      threadId: null,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 5. Resolve Shauri thread
   * ---------------------------------------------------------------
   *
   * IMPORTANT:
   *
   * resolveThread() is the ONLY authority for deciding which
   * existing decision matter receives this message.
   *
   * We intentionally DO NOT do this:
   *
   *   route.intent === "shauri_continue" &&
   *   route.threadId
   *
   * because the router can identify the general intent without
   * reliably determining thread ownership.
   *
   * Example:
   *
   * Existing thread:
   *   accounting job vs freelance
   *
   * New message:
   *   should I buy a plot of land?
   *
   * The router may still classify this as a Shauri continuation,
   * but resolveThread() must be allowed to determine that it is
   * actually a NEW matter.
   */

  const resolution =
    await resolveThread(
      input.userId,
      input.text,
    );

  /*
   * ---------------------------------------------------------------
   * 6. Ambiguous matter
   * ---------------------------------------------------------------
   */

  if (resolution.type === "ambiguous") {
    const lines =
      resolution.candidates
        .map(
          (candidate, index) =>
            `${index + 1}. ${candidate.summary}`,
        )
        .join("\n");

    return {
      duplicate: false,
      reply:
        `I have more than one open matter this could refer to. ` +
        `Which one do you mean?\n${lines}`,
      threadId: null,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 7. New Shauri session + payment gate
   * ---------------------------------------------------------------
   *
   * Payment is only initiated when the resolver determines that
   * this is a NEW decision matter.
   *
   * Existing matters do not trigger a new payment.
   */

  if (
    resolution.type === "new" &&
    process.env.REQUIRE_PAYMENT === "true"
  ) {
    const payment =
      await initiateSTKPush({
        userId:
          input.userId,
        phone:
          input.phone,
        originalMessage:
          input.text,
        externalMessageId:
          input.externalId,
      });

    return {
      duplicate: false,
      reply:
        payment.checkoutRequestId
          ? "Check your phone for the M-Pesa prompt. I’ll start the decision session after payment is confirmed."
          : "I couldn't send the payment prompt just now. Please try again in a moment.",
      threadId: null,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 8. Create a new thread when necessary
   * ---------------------------------------------------------------
   */

  const threadId =
    resolution.type === "new"
      ? (
          await prisma.thread.create({
            data: {
              userId:
                input.userId,
            },
          })
        ).id
      : resolution.threadId;

  /*
   * ---------------------------------------------------------------
   * 9. Message-level idempotency
   * ---------------------------------------------------------------
   *
   * The inbound-message boundary already handles receipt-level
   * idempotency.
   *
   * This additional check protects the Message table itself.
   */

  /*
   * ---------------------------------------------------------------
   * 10. Persist inbound message
   * ---------------------------------------------------------------
   */

  await prisma.message.create({
    data: {
      threadId,
      direction: "IN",
      content:
        input.text,
      externalId:
        input.externalId,
      channel:
        input.channel,
    },
  });

  /*
   * ---------------------------------------------------------------
   * 11. Build injected context
   * ---------------------------------------------------------------
   */

  const injectedContext =
    await buildInjectedContext(
      input.userId,
      input.text,
    );

  /*
   * ---------------------------------------------------------------
   * 12. Run Shauri
   * ---------------------------------------------------------------
   */

  const result =
    await runShauriGraph({
      threadId,
      userId:
        input.userId,
      rawInput:
        input.text,
      injectedContext,
    });

  /*
   * ---------------------------------------------------------------
   * 13. Persist Shauri response
   * ---------------------------------------------------------------
   */

  await prisma.message.create({
    data: {
      threadId,
      direction: "OUT",
      content:
        result.reply,
      channel:
        input.channel,
    },
  });

  /*
   * ---------------------------------------------------------------
   * 14. Return response
   * ---------------------------------------------------------------
   */

  return {
    duplicate: false,
    reply:
      result.reply,
    threadId,
  };
}