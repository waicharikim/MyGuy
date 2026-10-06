import { OperatorNotificationType } from "@prisma/client";
import { Queue } from "bullmq";
import { prisma } from "../infrastructure/prisma";

const QUEUE_NAME = "shauri-operator-notifications";

async function enqueueMany(notificationIds: string[]) {
  if (notificationIds.length === 0) {
    return;
  }

  const queue = new Queue(QUEUE_NAME, {
    connection: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT || 6379),
    },
  });
  try {
    await Promise.all(notificationIds.map((notificationId) =>
      queue.add(
        "send-operator-notification",
        { notificationId },
        {
          jobId: notificationId,
          attempts: 5,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      ),
    ));
  } finally {
    await queue.close();
  }
}

export async function notifyOperatorOfHumanQuery(humanQueryId: string) {
  const notification = await prisma.operatorNotification.upsert({
    where: { humanQueryId },
    create: {
      type: OperatorNotificationType.HUMAN_QUERY,
      humanQueryId,
    },
    update: {},
  });

  if (!notification.sentAt) {
    await enqueueMany([notification.id]);
  }
}

export async function notifyOperatorOfEscalation(escalationId: string) {
  const notification = await prisma.operatorNotification.upsert({
    where: { escalationId },
    create: {
      type: OperatorNotificationType.ESCALATION,
      escalationId,
    },
    update: {},
  });

  if (!notification.sentAt) {
    await enqueueMany([notification.id]);
  }
}

export async function enqueuePendingOperatorNotifications() {
  const [openQueries, openEscalations] = await Promise.all([
    prisma.humanQuery.findMany({
      where: { status: "OPEN", source: "OPERATOR" },
      select: { id: true },
    }),
    prisma.escalation.findMany({
      where: { status: "OPEN" },
      select: { id: true },
    }),
  ]);

  await Promise.all([
    prisma.operatorNotification.createMany({
      data: openQueries.map(({ id }) => ({
        type: OperatorNotificationType.HUMAN_QUERY,
        humanQueryId: id,
      })),
      skipDuplicates: true,
    }),
    prisma.operatorNotification.createMany({
      data: openEscalations.map(({ id }) => ({
        type: OperatorNotificationType.ESCALATION,
        escalationId: id,
      })),
      skipDuplicates: true,
    }),
  ]);

  const pending = await prisma.operatorNotification.findMany({
    where: {
      sentAt: null,
      nextAttemptAt: { lte: new Date() },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  await enqueueMany(pending.map(({ id }) => id));
}

export async function retryPendingOperatorNotifications() {
  await prisma.operatorNotification.updateMany({
    where: {
      sentAt: null,
      lastError: { not: null },
    },
    data: { nextAttemptAt: new Date() },
  });
  await enqueuePendingOperatorNotifications();
}

export { QUEUE_NAME as OPERATOR_NOTIFICATION_QUEUE };
