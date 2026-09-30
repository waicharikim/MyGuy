/**
 * Thread State Machine
 * --------------------
 *
 * Owns all state transitions for a Shauri decision thread.
 *
 * The graph decides WHAT should happen.
 * This service decides HOW the persistent Thread state changes.
 *
 * Human-query invariant:
 *
 *   awaitingHuman = true
 *     → awaitingSource is USER or OPERATOR
 *
 *   awaitingHuman = false
 *     → awaitingSource is NONE
 *
 * This prevents the graph, HTTP handlers, and human-query lifecycle from
 * independently mutating thread pause state.
 */

import {
  DecisionPass,
  HumanQuerySource,
  ThreadStatus,
} from "@prisma/client";

import { prisma } from "../infrastructure/prisma";

export type ThreadTransition =
  | "close"
  | "escalate"
  | "reopen"
  | "pause_user"
  | "pause_human"
  | "advance";

export class ThreadStateService {
  async transition(
    threadId: string,
    transition: ThreadTransition,
    pass?: DecisionPass,
    awaitingSource?: HumanQuerySource,
  ) {
    const thread = await prisma.thread.findUniqueOrThrow({
      where: { id: threadId },
    });

    /*
     * CLOSED threads may only be reopened.
     */
    if (transition === "close") {
      if (thread.status !== ThreadStatus.OPEN) {
        throw new Error(
          `Cannot close ${thread.status} thread`,
        );
      }

      return prisma.thread.update({
        where: { id: threadId },
        data: {
          status: ThreadStatus.CLOSED,
          awaitingReply: false,
          awaitingHuman: false,
          awaitingSource: HumanQuerySource.NONE,
          pendingCloseConfirmation: false,
          closedAt: new Date(),
          ...(pass ? { currentPass: pass } : {}),
        },
      });
    }

    if (transition === "escalate") {
      if (thread.status === ThreadStatus.CLOSED) {
        throw new Error(
          "Cannot escalate a closed thread without reopening it first",
        );
      }

      return prisma.thread.update({
        where: { id: threadId },
        data: {
          status: ThreadStatus.ESCALATED,
          awaitingReply: false,
          awaitingHuman: false,
          awaitingSource: HumanQuerySource.NONE,
          pendingCloseConfirmation: false,
          ...(pass ? { currentPass: pass } : {}),
        },
      });
    }

    if (transition === "reopen") {
      if (thread.status === ThreadStatus.OPEN) {
        return thread;
      }

      return prisma.thread.update({
        where: { id: threadId },
        data: {
          status: ThreadStatus.OPEN,
          closedAt: null,
        },
      });
    }

    /*
     * All remaining transitions operate on OPEN threads.
     */
    if (thread.status !== ThreadStatus.OPEN) {
      throw new Error(
        `Cannot pause/advance a ${thread.status} thread`,
      );
    }

    /*
     * User is expected to provide the next answer.
     */
    if (transition === "pause_user") {
      return prisma.thread.update({
        where: { id: threadId },
        data: {
          awaitingReply: true,
          awaitingHuman: false,
          awaitingSource: HumanQuerySource.NONE,
          ...(pass ? { currentPass: pass } : {}),
        },
      });
    }

    /*
     * A human query has been opened.
     *
     * The caller MUST specify who owns the answer:
     *
     *   USER
     *   OPERATOR
     *
     * NONE would violate the lifecycle invariant.
     */
    if (transition === "pause_human") {
      if (
        awaitingSource !== HumanQuerySource.USER &&
        awaitingSource !== HumanQuerySource.OPERATOR
      ) {
        throw new Error(
          "pause_human requires awaitingSource USER or OPERATOR",
        );
      }

      return prisma.thread.update({
        where: { id: threadId },
        data: {
          awaitingReply: false,
          awaitingHuman: true,
          awaitingSource,
          ...(pass ? { currentPass: pass } : {}),
        },
      });
    }

    /*
     * advance means the thread is no longer waiting for either the user
     * or an operator.
     */
    return prisma.thread.update({
      where: { id: threadId },
      data: {
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: HumanQuerySource.NONE,
        ...(pass ? { currentPass: pass } : {}),
      },
    });
  }
}

export const threadState = new ThreadStateService();