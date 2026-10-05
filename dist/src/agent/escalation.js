"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyEscalation = notifyEscalation;
const prisma_1 = require("../infrastructure/prisma");
const thread_1 = require("../domain/thread");
const operator_notification_1 = require("./operator-notification");
async function notifyEscalation(params) {
    const existing = await prisma_1.prisma.escalation.findFirst({ where: { threadId: params.threadId, status: "OPEN" } });
    const escalation = existing ?? await prisma_1.prisma.escalation.create({ data: { userId: params.userId, threadId: params.threadId, reason: params.reason, messages: { create: { direction: "SYSTEM", content: params.reason } } } });
    if (!existing)
        await thread_1.threadState.transition(params.threadId, "escalate", "CLOSE");
    await (0, operator_notification_1.notifyOperatorOfEscalation)(escalation.id);
    return escalation;
}
