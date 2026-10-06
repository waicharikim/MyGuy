import "dotenv/config";
import { Queue } from "bullmq";
import { prisma } from "../src/infrastructure/prisma";
import { sendUserMessage } from "../src/messaging/send-user-message";
import { telegramJobId } from "../src/telegram/job-id";
import {
  linkTelegramIdentity,
  normalizeTelegramPhone,
} from "../src/telegram/identity";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function expectRejects(action: () => Promise<unknown>, match: string) {
  try {
    await action();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(match),
      `Expected rejection containing "${match}".`,
    );
    return;
  }
  throw new Error(`TEST FAILED: Expected rejection containing "${match}".`);
}

async function main() {
  const suffix = String(Date.now()).slice(-8);
  const phone = `254700${suffix}`;
  const chatId = `telegram-test-${process.pid}-${Date.now()}`;
  let userId: string | undefined;

  try {
    assert(
      normalizeTelegramPhone("+254 (700) 123-456") === "254700123456",
      "Phone numbers should normalize to international digits.",
    );
    await expectRejects(
      () =>
        linkTelegramIdentity({
          chatId,
          senderId: "111",
          contactUserId: 222,
          phone,
        }),
      "shared by the account owner",
    );
    assert(
      !(await prisma.user.findUnique({ where: { phone } })),
      "A mismatched contact must not create or link an account.",
    );
    await expectRejects(
      () =>
        linkTelegramIdentity({
          chatId,
          senderId: "111",
          contactUserId: "111",
          phone,
        }),
      "No Shauri account",
    );
    assert(
      !(await prisma.user.findUnique({ where: { phone } })),
      "Telegram linking must not silently create an account without matching history.",
    );

    const existingUser = await prisma.user.create({
      data: { phone: `+${phone}` },
    });
    userId = existingUser.id;
    const linked = await linkTelegramIdentity({
      chatId,
      senderId: "111",
      contactUserId: 111,
      phone: `+${phone}`,
    });
    assert(linked.userId === existingUser.id, "Telegram should link to an existing plus-prefixed phone account.");
    assert(linked.channel === "telegram", "The identity should be recorded as Telegram.");
    assert(linked.user.phone === `+${phone}`, "Linking should preserve the existing account phone.");

    const duplicate = await linkTelegramIdentity({
      chatId,
      senderId: "111",
      contactUserId: "111",
      phone,
    });
    assert(duplicate.id === linked.id, "Repeated sharing should preserve one identity mapping.");

    const deliveries: string[] = [];
    const fakeSenders = {
      whatsapp: async (recipient: string) => {
        deliveries.push(`whatsapp:${recipient}`);
      },
      telegram: async (recipient: string) => {
        deliveries.push(`telegram:${recipient}`);
      },
    };
    await prisma.channelIdentity.create({
      data: {
        userId: existingUser.id,
        channel: "whatsapp",
        externalId: `+${phone}`,
        lastUsedAt: new Date(0),
      },
    });
    await sendUserMessage(existingUser.id, `+${phone}`, "test", fakeSenders);
    assert(
      deliveries.pop() === `telegram:${chatId}`,
      "Replies should route to the most recently active Telegram identity.",
    );
    await prisma.channelIdentity.update({
      where: {
        channel_externalId: {
          channel: "whatsapp",
          externalId: `+${phone}`,
        },
      },
      data: { lastUsedAt: new Date(Date.now() + 60_000) },
    });
    await sendUserMessage(existingUser.id, `+${phone}`, "test", fakeSenders);
    assert(
      deliveries.pop() === `whatsapp:+${phone}`,
      "Replies should return to WhatsApp when it becomes the most recently active channel.",
    );

    const queueName = `telegram-idempotency-${process.pid}-${Date.now()}`;
    const testQueue = new Queue(queueName, {
      connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
      },
    });
    const jobId = telegramJobId(chatId, 45);
    try {
      await testQueue.add("telegram-update", {}, { jobId });
      await testQueue.add("telegram-update", {}, { jobId });
      const counts = await testQueue.getJobCounts("waiting");
      assert(counts.waiting === 1, "Duplicate Telegram updates should enqueue one job.");
    } finally {
      const job = await testQueue.getJob(jobId);
      await job?.remove();
      await testQueue.close();
    }

    await expectRejects(
      () =>
        linkTelegramIdentity({
          chatId,
          senderId: "111",
          contactUserId: "111",
          phone: "254711123456",
        }),
      "already linked",
    );
    assert(
      !(await prisma.user.findFirst({ where: { phone: { in: ["254711123456", "+254711123456"] } } })),
      "A conflicting relink must not create an orphan account.",
    );
    console.log("✓ Telegram contact ownership, existing-account linking, duplicate suppression, and channel routing pass");
  } finally {
    await prisma.channelIdentity.deleteMany({
      where: { channel: "telegram", externalId: chatId },
    });
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log("TELEGRAM IDENTITY TEST PASSED"))
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
