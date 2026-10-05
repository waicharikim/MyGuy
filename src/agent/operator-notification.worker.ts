import { Worker } from "bullmq";
import {
  enqueuePendingOperatorNotifications,
  OPERATOR_NOTIFICATION_QUEUE,
} from "./operator-notification";
import { deliverOperatorNotification } from "./operator-notification-delivery";

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT || 6379),
};

const worker = new Worker(
  OPERATOR_NOTIFICATION_QUEUE,
  (job) => deliverOperatorNotification(job.data.notificationId),
  { connection },
);

worker.on("failed", (job, error) => {
  console.error(`Operator notification ${job?.id} failed`, error);
});

const pendingNotificationSweep = setInterval(() => {
  enqueuePendingOperatorNotifications().catch((error) => {
    console.error("Unable to enqueue pending operator notifications", error);
  });
}, 60_000);
pendingNotificationSweep.unref();

enqueuePendingOperatorNotifications().catch((error) => {
  console.error("Unable to enqueue pending operator notifications", error);
});

export default worker;
