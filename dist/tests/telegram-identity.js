"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bullmq_1 = require("bullmq");
const prisma_1 = require("../src/infrastructure/prisma");
const send_user_message_1 = require("../src/messaging/send-user-message");
const job_id_1 = require("../src/telegram/job-id");
const identity_1 = require("../src/telegram/identity");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function expectRejects(action, match) {
    try {
        await action();
    }
    catch (error) {
        assert(error instanceof Error && error.message.includes(match), `Expected rejection containing "${match}".`);
        return;
    }
    throw new Error(`TEST FAILED: Expected rejection containing "${match}".`);
}
async function main() {
    const suffix = String(Date.now()).slice(-8);
    const phone = `254700${suffix}`;
    const chatId = `telegram-test-${process.pid}-${Date.now()}`;
    let userId;
    try {
        assert((0, identity_1.normalizeTelegramPhone)("+254 (700) 123-456") === "254700123456", "Phone numbers should normalize to international digits.");
        await expectRejects(() => (0, identity_1.linkTelegramIdentity)({
            chatId,
            senderId: "111",
            contactUserId: 222,
            phone,
        }), "shared by the account owner");
        assert(!(await prisma_1.prisma.user.findUnique({ where: { phone } })), "A mismatched contact must not create or link an account.");
        await expectRejects(() => (0, identity_1.linkTelegramIdentity)({
            chatId,
            senderId: "111",
            contactUserId: "111",
            phone,
        }), "No Shauri account");
        assert(!(await prisma_1.prisma.user.findUnique({ where: { phone } })), "Telegram linking must not silently create an account without matching history.");
        const existingUser = await prisma_1.prisma.user.create({
            data: { phone: `+${phone}` },
        });
        userId = existingUser.id;
        const linked = await (0, identity_1.linkTelegramIdentity)({
            chatId,
            senderId: "111",
            contactUserId: 111,
            phone: `+${phone}`,
        });
        assert(linked.userId === existingUser.id, "Telegram should link to an existing plus-prefixed phone account.");
        assert(linked.channel === "telegram", "The identity should be recorded as Telegram.");
        assert(linked.user.phone === `+${phone}`, "Linking should preserve the existing account phone.");
        const duplicate = await (0, identity_1.linkTelegramIdentity)({
            chatId,
            senderId: "111",
            contactUserId: "111",
            phone,
        });
        assert(duplicate.id === linked.id, "Repeated sharing should preserve one identity mapping.");
        const deliveries = [];
        const fakeSenders = {
            whatsapp: async (recipient) => {
                deliveries.push(`whatsapp:${recipient}`);
            },
            telegram: async (recipient) => {
                deliveries.push(`telegram:${recipient}`);
            },
        };
        await prisma_1.prisma.channelIdentity.create({
            data: {
                userId: existingUser.id,
                channel: "whatsapp",
                externalId: `+${phone}`,
                lastUsedAt: new Date(0),
            },
        });
        await (0, send_user_message_1.sendUserMessage)(existingUser.id, `+${phone}`, "test", fakeSenders);
        assert(deliveries.pop() === `telegram:${chatId}`, "Replies should route to the most recently active Telegram identity.");
        await prisma_1.prisma.channelIdentity.update({
            where: {
                channel_externalId: {
                    channel: "whatsapp",
                    externalId: `+${phone}`,
                },
            },
            data: { lastUsedAt: new Date(Date.now() + 60_000) },
        });
        await (0, send_user_message_1.sendUserMessage)(existingUser.id, `+${phone}`, "test", fakeSenders);
        assert(deliveries.pop() === `whatsapp:+${phone}`, "Replies should return to WhatsApp when it becomes the most recently active channel.");
        const queueName = `telegram-idempotency-${process.pid}-${Date.now()}`;
        const testQueue = new bullmq_1.Queue(queueName, {
            connection: {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT || 6379),
            },
        });
        const jobId = (0, job_id_1.telegramJobId)(chatId, 45);
        try {
            await testQueue.add("telegram-update", {}, { jobId });
            await testQueue.add("telegram-update", {}, { jobId });
            const counts = await testQueue.getJobCounts("waiting");
            assert(counts.waiting === 1, "Duplicate Telegram updates should enqueue one job.");
        }
        finally {
            const job = await testQueue.getJob(jobId);
            await job?.remove();
            await testQueue.close();
        }
        await expectRejects(() => (0, identity_1.linkTelegramIdentity)({
            chatId,
            senderId: "111",
            contactUserId: "111",
            phone: "254711123456",
        }), "already linked");
        assert(!(await prisma_1.prisma.user.findFirst({ where: { phone: { in: ["254711123456", "+254711123456"] } } })), "A conflicting relink must not create an orphan account.");
        console.log("✓ Telegram contact ownership, existing-account linking, duplicate suppression, and channel routing pass");
    }
    finally {
        await prisma_1.prisma.channelIdentity.deleteMany({
            where: { channel: "telegram", externalId: chatId },
        });
        if (userId) {
            await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
        }
        await prisma_1.prisma.$disconnect();
    }
}
main()
    .then(() => console.log("TELEGRAM IDENTITY TEST PASSED"))
    .catch(async (error) => {
    console.error(error);
    await prisma_1.prisma.$disconnect();
    process.exit(1);
});
