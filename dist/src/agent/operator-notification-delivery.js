"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverOperatorNotification = deliverOperatorNotification;
const prisma_1 = require("../infrastructure/prisma");
const send_1 = require("../whatsapp/send");
async function deliverOperatorNotification(notificationId, send = send_1.sendWhatsappMessage) {
    const notification = await prisma_1.prisma.operatorNotification.findUnique({
        where: { id: notificationId },
        include: {
            humanQuery: { include: { user: true } },
            escalation: {
                include: {
                    user: true,
                    thread: {
                        select: {
                            decisionSummary: true,
                            decisionRecords: {
                                take: 1,
                                select: { matter: true },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!notification || notification.sentAt) {
        return;
    }
    const message = notification.type === "HUMAN_QUERY" && notification.humanQuery
        ? [
            "Shauri needs an operator response.",
            `Matter: ${notification.humanQuery.matter}`,
            `Question: ${notification.humanQuery.question}`,
            `Reason: ${notification.humanQuery.reason}`,
            `User: ${notification.humanQuery.user.phone}`,
        ].join("\n")
        : notification.type === "ESCALATION" && notification.escalation
            ? [
                "Shauri has escalated a decision for human review.",
                `Matter: ${notification.escalation.thread.decisionRecords[0]?.matter || notification.escalation.thread.decisionSummary || notification.escalation.threadId}`,
                `Reason: ${notification.escalation.reason}`,
                `User: ${notification.escalation.user.phone}`,
            ].join("\n")
            : null;
    if (!message) {
        throw new Error(`Operator notification ${notification.id} has no valid handoff`);
    }
    await prisma_1.prisma.operatorNotification.update({
        where: { id: notification.id },
        data: { attempts: { increment: 1 }, lastError: null },
    });
    try {
        const operatorPhone = process.env.OPERATOR_WHATSAPP_PHONE;
        if (!operatorPhone) {
            throw new Error("OPERATOR_WHATSAPP_PHONE is required for operator notifications");
        }
        await send(operatorPhone, message, { required: true });
    }
    catch (error) {
        await prisma_1.prisma.operatorNotification.update({
            where: { id: notification.id },
            data: {
                lastError: error instanceof Error ? error.message : String(error),
                nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
            },
        });
        throw error;
    }
    return prisma_1.prisma.operatorNotification.update({
        where: { id: notification.id },
        data: { sentAt: new Date(), lastError: null },
    });
}
