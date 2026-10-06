"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPERATOR_NOTIFICATION_QUEUE = void 0;
exports.notifyOperatorOfHumanQuery = notifyOperatorOfHumanQuery;
exports.notifyOperatorOfEscalation = notifyOperatorOfEscalation;
exports.enqueuePendingOperatorNotifications = enqueuePendingOperatorNotifications;
exports.retryPendingOperatorNotifications = retryPendingOperatorNotifications;
const client_1 = require("@prisma/client");
const bullmq_1 = require("bullmq");
const prisma_1 = require("../infrastructure/prisma");
const QUEUE_NAME = "shauri-operator-notifications";
exports.OPERATOR_NOTIFICATION_QUEUE = QUEUE_NAME;
async function enqueueMany(notificationIds) {
    if (notificationIds.length === 0) {
        return;
    }
    const queue = new bullmq_1.Queue(QUEUE_NAME, {
        connection: {
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT || 6379),
        },
    });
    try {
        await Promise.all(notificationIds.map((notificationId) => queue.add("send-operator-notification", { notificationId }, {
            jobId: notificationId,
            attempts: 5,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: true,
            removeOnFail: true,
        })));
    }
    finally {
        await queue.close();
    }
}
async function notifyOperatorOfHumanQuery(humanQueryId) {
    const notification = await prisma_1.prisma.operatorNotification.upsert({
        where: { humanQueryId },
        create: {
            type: client_1.OperatorNotificationType.HUMAN_QUERY,
            humanQueryId,
        },
        update: {},
    });
    if (!notification.sentAt) {
        await enqueueMany([notification.id]);
    }
}
async function notifyOperatorOfEscalation(escalationId) {
    const notification = await prisma_1.prisma.operatorNotification.upsert({
        where: { escalationId },
        create: {
            type: client_1.OperatorNotificationType.ESCALATION,
            escalationId,
        },
        update: {},
    });
    if (!notification.sentAt) {
        await enqueueMany([notification.id]);
    }
}
async function enqueuePendingOperatorNotifications() {
    const [openQueries, openEscalations] = await Promise.all([
        prisma_1.prisma.humanQuery.findMany({
            where: { status: "OPEN", source: "OPERATOR" },
            select: { id: true },
        }),
        prisma_1.prisma.escalation.findMany({
            where: { status: "OPEN" },
            select: { id: true },
        }),
    ]);
    await Promise.all([
        prisma_1.prisma.operatorNotification.createMany({
            data: openQueries.map(({ id }) => ({
                type: client_1.OperatorNotificationType.HUMAN_QUERY,
                humanQueryId: id,
            })),
            skipDuplicates: true,
        }),
        prisma_1.prisma.operatorNotification.createMany({
            data: openEscalations.map(({ id }) => ({
                type: client_1.OperatorNotificationType.ESCALATION,
                escalationId: id,
            })),
            skipDuplicates: true,
        }),
    ]);
    const pending = await prisma_1.prisma.operatorNotification.findMany({
        where: {
            sentAt: null,
            nextAttemptAt: { lte: new Date() },
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
    });
    await enqueueMany(pending.map(({ id }) => id));
}
async function retryPendingOperatorNotifications() {
    await prisma_1.prisma.operatorNotification.updateMany({
        where: {
            sentAt: null,
            lastError: { not: null },
        },
        data: { nextAttemptAt: new Date() },
    });
    await enqueuePendingOperatorNotifications();
}
