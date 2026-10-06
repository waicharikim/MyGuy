"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bullmq_1 = require("bullmq");
const human_controller_1 = require("../src/human.controller");
const prisma_1 = require("../src/infrastructure/prisma");
const human_query_1 = require("../src/agent/human-query");
const operator_escalation_1 = require("../src/agent/operator-escalation");
const escalation_1 = require("../src/agent/escalation");
const operator_notification_1 = require("../src/agent/operator-notification");
const operator_notification_delivery_1 = require("../src/agent/operator-notification-delivery");
const operator_link_1 = require("../src/telegram/operator-link");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function cleanup(userId) {
    const notifications = await prisma_1.prisma.operatorNotification.findMany({
        where: {
            OR: [
                { humanQuery: { userId } },
                { escalation: { userId } },
            ],
        },
        select: { id: true },
    });
    const queue = new bullmq_1.Queue(operator_notification_1.OPERATOR_NOTIFICATION_QUEUE, {
        connection: {
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT || 6379),
        },
    });
    try {
        for (const notification of notifications) {
            await (await queue.getJob(notification.id))?.remove();
        }
    }
    finally {
        await queue.close();
    }
    await prisma_1.prisma.escalationMessage.deleteMany({
        where: { escalation: { userId } },
    });
    await prisma_1.prisma.escalation.deleteMany({ where: { userId } });
    await prisma_1.prisma.humanQueryMessage.deleteMany({
        where: { humanQuery: { userId } },
    });
    await prisma_1.prisma.humanQuery.deleteMany({ where: { userId } });
    await prisma_1.prisma.groundingEvidence.deleteMany({
        where: { thread: { userId } },
    });
    await prisma_1.prisma.decisionRecord.deleteMany({ where: { userId } });
    await prisma_1.prisma.userProfile.deleteMany({ where: { userId } });
    await prisma_1.prisma.message.deleteMany({ where: { thread: { userId } } });
    await prisma_1.prisma.thread.deleteMany({ where: { userId } });
    await prisma_1.prisma.user.delete({ where: { id: userId } });
}
async function main() {
    let userId;
    const previousToken = process.env.INTERNAL_OPERATOR_TOKEN;
    const previousOperatorPhone = process.env.OPERATOR_WHATSAPP_PHONE;
    const previousOperatorDashboardUrl = process.env.OPERATOR_DASHBOARD_URL;
    const previousTelegramSetupCode = process.env.TELEGRAM_OPERATOR_SETUP_CODE;
    const testTelegramChatId = `operator-test-${process.pid}-${Date.now()}`;
    try {
        const user = await prisma_1.prisma.user.create({
            data: {
                phone: `+2547${Date.now().toString().slice(-8)}`,
                profile: {
                    create: {
                        summary: "Prefers stable income and low financial risk.",
                        values: ["stability"],
                        recurringConcerns: ["income reliability"],
                    },
                },
            },
        });
        userId = user.id;
        const queryThread = await prisma_1.prisma.thread.create({
            data: {
                userId,
                known: ["The user has received a job offer."],
                open: ["The employer has not confirmed the start date."],
                decisionSummary: "Whether to accept the job offer.",
            },
        });
        await prisma_1.prisma.message.createMany({
            data: [
                {
                    threadId: queryThread.id,
                    direction: "IN",
                    channel: "telegram",
                    content: "I am considering this job offer.",
                    createdAt: new Date(Date.now() - 2_000),
                },
                {
                    threadId: queryThread.id,
                    direction: "OUT",
                    channel: "telegram",
                    content: "What matters most in your decision?",
                    createdAt: new Date(Date.now() - 1_000),
                },
            ],
        });
        await prisma_1.prisma.decisionRecord.create({
            data: {
                userId,
                threadId: queryThread.id,
                matter: "Whether to accept the job offer.",
                status: "AWAITING_HUMAN",
                decisionSummary: "Confirm the employer's start date before deciding.",
                goal: "Choose a reliable employment option.",
                recommendedOption: "Wait for confirmation of the start date.",
                confidence: 0.72,
                risks: ["Unconfirmed start date"],
                assumptions: ["The offer remains available."],
                unresolvedQuestions: ["When does the role begin?"],
                evidenceRefs: ["https://example.test/job-offer"],
                humanInputs: ["User prefers stable income."],
            },
        });
        await prisma_1.prisma.groundingEvidence.create({
            data: {
                threadId: queryThread.id,
                claim: "The role's start date is confirmed.",
                searchQuery: "employer start date",
                sourceUrl: "https://example.test/job-offer",
                sourceTitle: "Offer details",
                finding: "The start date is still pending confirmation.",
                confidence: 0.8,
            },
        });
        const operatorQuery = await (0, human_query_1.createHumanQuery)({
            userId,
            threadId: queryThread.id,
            matter: "Whether to accept the job offer.",
            question: "Can the employer confirm the start date?",
            knownContext: JSON.stringify({
                known: ["The user has received a job offer."],
            }),
            reason: "The start date is controlled by the employer.",
            source: "OPERATOR",
        });
        const escalationThread = await prisma_1.prisma.thread.create({
            data: {
                userId,
                known: ["The user reports a service problem."],
                decisionSummary: "Resolve the reported service problem.",
            },
        });
        await prisma_1.prisma.decisionRecord.create({
            data: {
                userId,
                threadId: escalationThread.id,
                matter: "Resolve the reported service problem.",
                status: "ESCALATED",
                decisionSummary: "A staff member needs to review the issue.",
                goal: "Restore the service.",
                recommendedOption: "Review the account and contact the user.",
                confidence: 0.4,
                risks: ["Service remains unavailable."],
                escalationReason: "The issue requires account-level access.",
            },
        });
        const escalation = await (0, escalation_1.notifyEscalation)({
            threadId: escalationThread.id,
            userId,
            userPhone: user.phone,
            reason: "The issue requires account-level access.",
        });
        await (0, escalation_1.notifyEscalation)({
            threadId: escalationThread.id,
            userId,
            userPhone: user.phone,
            reason: "The issue requires account-level access.",
        });
        const controller = new human_controller_1.HumanController();
        const dashboardHtml = controller.dashboard();
        assert(dashboardHtml.includes("Shauri Operator Desk") &&
            dashboardHtml.includes('request("metrics")') &&
            dashboardHtml.includes("sessionStorage") &&
            dashboardHtml.includes("textContent") &&
            dashboardHtml.includes("Open questions:") &&
            dashboardHtml.includes("conversationTranscript") &&
            dashboardHtml.includes("Record internal note") &&
            dashboardHtml.includes("Send user update") &&
            dashboardHtml.includes("Resolve and notify user") &&
            dashboardHtml.includes("Awaiting operator") &&
            dashboardHtml.includes("quality.handoffs.operatorQueries.OPEN") &&
            dashboardHtml.includes("View operator handoffs"), "Operator dashboard should render and use the authenticated APIs.");
        process.env.INTERNAL_OPERATOR_TOKEN = "operator-queue-test-token";
        let unauthorized = false;
        try {
            await controller.queue({});
        }
        catch {
            unauthorized = true;
        }
        assert(unauthorized, "The operator queue must reject requests without a token.");
        const queue = await controller.queue({
            "x-operator-token": "operator-queue-test-token",
        });
        assert(queue.humanQueries.some((item) => item.id === operatorQuery.id), "Queue should contain the open operator query.");
        assert(queue.escalations.some((item) => item.id === escalation.id), "Queue should contain the open escalation.");
        const humanQuery = queue.humanQueries.find((item) => item.id === operatorQuery.id);
        assert(humanQuery, "The test operator query must be present.");
        assert(humanQuery.thread.messages.length === 2 &&
            humanQuery.thread.messages[0].direction === "IN" &&
            humanQuery.thread.messages[0].content ===
                "I am considering this job offer." &&
            humanQuery.thread.messages[1].direction === "OUT" &&
            humanQuery.thread.messages[1].content ===
                "What matters most in your decision?", "The operator queue should provide recent conversation messages in chronological order.");
        assert(humanQuery.operatorNotification !== null &&
            humanQuery.operatorNotification.sentAt === null, "Operator human queries should have durable pending WhatsApp notifications.");
        process.env.OPERATOR_WHATSAPP_PHONE = "+254700000000";
        process.env.OPERATOR_DASHBOARD_URL =
            "https://shauri.example.com/internal/human/dashboard";
        const notificationId = humanQuery.operatorNotification.id;
        const recoveryQueue = new bullmq_1.Queue(operator_notification_1.OPERATOR_NOTIFICATION_QUEUE, {
            connection: {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT || 6379),
            },
        });
        try {
            await prisma_1.prisma.operatorNotification.update({
                where: { id: notificationId },
                data: {
                    sentAt: null,
                    attempts: 0,
                    nextAttemptAt: new Date(0),
                    lastError: null,
                },
            });
            await (await recoveryQueue.getJob(notificationId))?.remove();
            await (0, operator_notification_1.enqueuePendingOperatorNotifications)();
            const recoveredJob = await recoveryQueue.getJob(notificationId);
            assert(recoveredJob?.data.notificationId === notificationId, "Pending operator notifications should be re-enqueued after a queue restart.");
        }
        finally {
            await recoveryQueue.close();
        }
        let failedDelivery = false;
        try {
            await (0, operator_notification_delivery_1.deliverOperatorNotification)(notificationId, async () => {
                throw new Error("temporary delivery failure");
            }, undefined, async () => null);
        }
        catch {
            failedDelivery = true;
        }
        assert(failedDelivery, "WhatsApp delivery failures must remain visible to the retry path.");
        const failedNotification = await prisma_1.prisma.operatorNotification.findUniqueOrThrow({
            where: { id: notificationId },
        });
        assert(failedNotification.attempts === 1 &&
            failedNotification.lastError?.includes("temporary delivery failure") === true &&
            failedNotification.nextAttemptAt > new Date(), `Failed notification attempts and retry time must persist (attempts=${failedNotification.attempts}, error=${failedNotification.lastError}, next=${failedNotification.nextAttemptAt.toISOString()}).`);
        let deliveredPhone = "";
        let deliveredMessage = "";
        await (0, operator_notification_delivery_1.deliverOperatorNotification)(notificationId, async (phone, message) => {
            deliveredPhone = phone;
            deliveredMessage = message;
        }, undefined, async () => null);
        assert(deliveredPhone === process.env.OPERATOR_WHATSAPP_PHONE &&
            deliveredMessage.includes("confirm the start date") &&
            deliveredMessage.includes(process.env.OPERATOR_DASHBOARD_URL), "The retry must include the human-query handoff and Operator Desk link.");
        const deliveredNotification = await prisma_1.prisma.operatorNotification.findUniqueOrThrow({
            where: { id: notificationId },
        });
        assert(deliveredNotification.sentAt instanceof Date &&
            deliveredNotification.lastError === null &&
            deliveredNotification.attempts === 2, "Successful delivery must be durably recorded and stop retries.");
        let duplicateSendAttempted = false;
        await (0, operator_notification_delivery_1.deliverOperatorNotification)(notificationId, async () => {
            duplicateSendAttempted = true;
        }, undefined, async () => null);
        assert(!duplicateSendAttempted, "A sent notification must not be sent again.");
        assert(humanQuery.question.includes("confirm the start date"), "Question should be present.");
        assert(humanQuery.reason.includes("controlled by the employer"), "Handoff reason should be present.");
        assert(humanQuery.thread.known.includes("The user has received a job offer."), "Known facts should be included.");
        assert(humanQuery.thread.open.includes("The employer has not confirmed the start date."), "Outstanding questions should be included.");
        assert(humanQuery.thread.user.phone === user.phone, "Operator should receive the user's contact phone.");
        assert(humanQuery.thread.user.profile?.summary.includes("stable income"), "User profile summary should be included.");
        assert(humanQuery.thread.decisionRecords[0].recommendedOption?.includes("Wait for confirmation") === true, "Decision recommendation should be included.");
        assert(humanQuery.thread.decisionRecords[0].unresolvedQuestions.includes("When does the role begin?"), "Decision open questions should be included.");
        assert(humanQuery.thread.groundingEvidence[0].sourceUrl === "https://example.test/job-offer", "Grounding provenance should be included.");
        const queuedEscalation = queue.escalations.find((item) => item.id === escalation.id);
        assert(queuedEscalation, "The test escalation must be present.");
        assert(queuedEscalation.id === escalation.id, "Escalation should be idempotent for an open thread.");
        assert(queuedEscalation.matter === "Resolve the reported service problem.", "Escalations should include their decision matter for the dashboard title.");
        assert(queuedEscalation.reason.includes("account-level access"), "Escalation reason should be included.");
        assert(queuedEscalation.thread.decisionRecords[0].status === "ESCALATED", "Escalation decision record should be included.");
        assert(queuedEscalation.operatorNotification !== null &&
            queuedEscalation.operatorNotification.sentAt === null, "Escalations should have durable pending WhatsApp notifications.");
        const setupCode = "test-telegram-operator-setup-code-32chars";
        process.env.TELEGRAM_OPERATOR_SETUP_CODE = setupCode;
        assert((0, operator_link_1.isTelegramOperatorSetupCodeValid)(setupCode) &&
            !(0, operator_link_1.isTelegramOperatorSetupCodeValid)("wrong-setup-code"), "Telegram operator pairing must verify the setup code.");
        let telegramRecipient = "";
        let telegramMessage = "";
        await (0, operator_notification_delivery_1.deliverOperatorNotification)(queuedEscalation.operatorNotification.id, async () => {
            throw new Error("WhatsApp should not be selected when Telegram is paired");
        }, async (chatId, message) => {
            telegramRecipient = chatId;
            telegramMessage = message;
        }, async () => ({ id: "primary", chatId: testTelegramChatId, linkedAt: new Date() }));
        assert(telegramRecipient === testTelegramChatId &&
            telegramMessage.includes("account-level access"), "Operator escalation notifications should be delivered to the paired Telegram chat.");
        const userMessages = [];
        const testSenders = {
            whatsapp: async (_phone, message) => {
                userMessages.push(message);
            },
            telegram: async (_chatId, message) => {
                userMessages.push(message);
            },
        };
        let updateFailureSurfaced = false;
        try {
            await (0, operator_escalation_1.sendEscalationUpdate)(escalation.id, "This update should fail.", {
                whatsapp: async () => {
                    throw new Error("test delivery failure");
                },
                telegram: async () => {
                    throw new Error("test delivery failure");
                },
            });
        }
        catch (error) {
            updateFailureSurfaced =
                error instanceof Error &&
                    error.message === "test delivery failure";
        }
        const afterFailedUpdate = await prisma_1.prisma.escalation.findUniqueOrThrow({
            where: { id: escalation.id },
            include: { messages: true },
        });
        assert(updateFailureSurfaced &&
            afterFailedUpdate.status === "OPEN" &&
            !afterFailedUpdate.messages.some((entry) => entry.content === "This update should fail."), "A failed user delivery must be surfaced without falsely recording or resolving the escalation.");
        await (0, operator_escalation_1.sendEscalationUpdate)(escalation.id, "We are investigating your account issue.", testSenders);
        const queueWithActivity = await controller.queue({
            "x-operator-token": "operator-queue-test-token",
        });
        const escalationWithActivity = queueWithActivity.escalations.find((item) => item.id === escalation.id);
        assert(userMessages[0] === "We are investigating your account issue." &&
            escalationWithActivity?.messages.some((message) => message.direction === "OUT" &&
                message.content === "We are investigating your account issue."), "Operator updates should be sent to the user and recorded in the escalation work log.");
        const resolvedEscalation = await (0, operator_escalation_1.resolveEscalation)(escalation.id, "Restored access after correcting the account setting.", "Your account access has been restored. Please try again and let us know if you still have trouble.", testSenders);
        assert(resolvedEscalation.status === "RESOLVED", "Operator resolution must close the escalation.");
        assert(userMessages[1]?.includes("access has been restored"), "Resolution should send the operator's user-facing message.");
        const escalationLog = await prisma_1.prisma.escalationMessage.findMany({
            where: { escalationId: escalation.id },
            orderBy: { createdAt: "asc" },
        });
        assert(escalationLog.some((entry) => entry.direction === "IN" &&
            entry.content === "Restored access after correcting the account setting.") &&
            escalationLog.some((entry) => entry.direction === "OUT" &&
                entry.content.includes("Your account access has been restored.")), "The resolution note and user message should both be recorded in the case activity.");
        const reopenedThread = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: escalationThread.id },
        });
        assert(reopenedThread.status === "OPEN", "Resolving an escalation should return its decision thread to OPEN.");
        const reopenedDecision = await prisma_1.prisma.decisionRecord.findUniqueOrThrow({
            where: { threadId: escalationThread.id },
        });
        assert(reopenedDecision.status === "OPEN" && reopenedDecision.closedAt === null, "Resolving an escalation should reopen its decision record.");
        let duplicateResolveRejected = false;
        try {
            await (0, operator_escalation_1.resolveEscalation)(escalation.id, "Duplicate resolution");
        }
        catch {
            duplicateResolveRejected = true;
        }
        assert(duplicateResolveRejected, "Resolved escalations must not be resolved a second time.");
        console.log("✓ operator queue requires the configured token");
        console.log("✓ open operator queries include decision and user context");
        console.log("✓ evidence provenance appears in the handoff summary");
        console.log("✓ open escalations include their decision summary");
    }
    finally {
        await prisma_1.prisma.telegramOperator.deleteMany({
            where: { id: "primary", chatId: testTelegramChatId },
        });
        if (previousTelegramSetupCode === undefined) {
            delete process.env.TELEGRAM_OPERATOR_SETUP_CODE;
        }
        else {
            process.env.TELEGRAM_OPERATOR_SETUP_CODE = previousTelegramSetupCode;
        }
        if (previousToken === undefined) {
            delete process.env.INTERNAL_OPERATOR_TOKEN;
        }
        else {
            process.env.INTERNAL_OPERATOR_TOKEN = previousToken;
        }
        if (previousOperatorPhone === undefined) {
            delete process.env.OPERATOR_WHATSAPP_PHONE;
        }
        else {
            process.env.OPERATOR_WHATSAPP_PHONE = previousOperatorPhone;
        }
        if (previousOperatorDashboardUrl === undefined) {
            delete process.env.OPERATOR_DASHBOARD_URL;
        }
        else {
            process.env.OPERATOR_DASHBOARD_URL = previousOperatorDashboardUrl;
        }
        if (userId) {
            await cleanup(userId);
        }
    }
}
main()
    .then(() => {
    console.log("OPERATOR QUEUE TEST PASSED");
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
