"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const operator_notification_1 = require("./operator-notification");
const operator_notification_delivery_1 = require("./operator-notification-delivery");
const connection = {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
};
const worker = new bullmq_1.Worker(operator_notification_1.OPERATOR_NOTIFICATION_QUEUE, (job) => (0, operator_notification_delivery_1.deliverOperatorNotification)(job.data.notificationId), { connection });
worker.on("failed", (job, error) => {
    console.error(`Operator notification ${job?.id} failed`, error);
});
const pendingNotificationSweep = setInterval(() => {
    (0, operator_notification_1.enqueuePendingOperatorNotifications)().catch((error) => {
        console.error("Unable to enqueue pending operator notifications", error);
    });
}, 60_000);
pendingNotificationSweep.unref();
(0, operator_notification_1.enqueuePendingOperatorNotifications)().catch((error) => {
    console.error("Unable to enqueue pending operator notifications", error);
});
exports.default = worker;
