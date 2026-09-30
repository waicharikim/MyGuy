"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.threadState = exports.ThreadStateService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../infrastructure/prisma");
class ThreadStateService {
    async transition(threadId, transition, pass, awaitingSource) {
        const thread = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: threadId },
        });
        /*
         * CLOSED threads may only be reopened.
         */
        if (transition === "close") {
            if (thread.status !== client_1.ThreadStatus.OPEN) {
                throw new Error(`Cannot close ${thread.status} thread`);
            }
            return prisma_1.prisma.thread.update({
                where: { id: threadId },
                data: {
                    status: client_1.ThreadStatus.CLOSED,
                    awaitingReply: false,
                    awaitingHuman: false,
                    awaitingSource: client_1.HumanQuerySource.NONE,
                    pendingCloseConfirmation: false,
                    closedAt: new Date(),
                    ...(pass ? { currentPass: pass } : {}),
                },
            });
        }
        if (transition === "escalate") {
            if (thread.status === client_1.ThreadStatus.CLOSED) {
                throw new Error("Cannot escalate a closed thread without reopening it first");
            }
            return prisma_1.prisma.thread.update({
                where: { id: threadId },
                data: {
                    status: client_1.ThreadStatus.ESCALATED,
                    awaitingReply: false,
                    awaitingHuman: false,
                    awaitingSource: client_1.HumanQuerySource.NONE,
                    pendingCloseConfirmation: false,
                    ...(pass ? { currentPass: pass } : {}),
                },
            });
        }
        if (transition === "reopen") {
            if (thread.status === client_1.ThreadStatus.OPEN) {
                return thread;
            }
            return prisma_1.prisma.thread.update({
                where: { id: threadId },
                data: {
                    status: client_1.ThreadStatus.OPEN,
                    closedAt: null,
                },
            });
        }
        /*
         * All remaining transitions operate on OPEN threads.
         */
        if (thread.status !== client_1.ThreadStatus.OPEN) {
            throw new Error(`Cannot pause/advance a ${thread.status} thread`);
        }
        /*
         * User is expected to provide the next answer.
         */
        if (transition === "pause_user") {
            return prisma_1.prisma.thread.update({
                where: { id: threadId },
                data: {
                    awaitingReply: true,
                    awaitingHuman: false,
                    awaitingSource: client_1.HumanQuerySource.NONE,
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
            if (awaitingSource !== client_1.HumanQuerySource.USER &&
                awaitingSource !== client_1.HumanQuerySource.OPERATOR) {
                throw new Error("pause_human requires awaitingSource USER or OPERATOR");
            }
            return prisma_1.prisma.thread.update({
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
        return prisma_1.prisma.thread.update({
            where: { id: threadId },
            data: {
                awaitingReply: false,
                awaitingHuman: false,
                awaitingSource: client_1.HumanQuerySource.NONE,
                ...(pass ? { currentPass: pass } : {}),
            },
        });
    }
}
exports.ThreadStateService = ThreadStateService;
exports.threadState = new ThreadStateService();
