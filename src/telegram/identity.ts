import { prisma } from "../infrastructure/prisma";

async function findUserByNormalizedPhone(phone: string) {
  const users = await prisma.user.findMany({
    where: { phone: { in: [phone, `+${phone}`] } },
  });
  if (users.length > 1) {
    throw new Error("Multiple Shauri accounts match this phone number");
  }
  return users[0] ?? null;
}

export function normalizeTelegramPhone(phone: string): string {
  const normalized = phone.replace(/[\s()-]/g, "").replace(/^\+/, "");
  if (!/^[1-9]\d{6,14}$/.test(normalized)) {
    throw new Error("Telegram contact must provide a valid international phone number");
  }
  return normalized;
}

export async function linkTelegramIdentity(input: {
  chatId: string;
  senderId: string;
  contactUserId?: string | number;
  phone: string;
}) {
  if (
    input.contactUserId === undefined ||
    String(input.contactUserId) !== input.senderId
  ) {
    throw new Error("Telegram contact must be shared by the account owner");
  }

  const phone = normalizeTelegramPhone(input.phone);
  const existing = await prisma.channelIdentity.findUnique({
    where: {
      channel_externalId: {
        channel: "telegram",
        externalId: input.chatId,
      },
    },
  });
  if (existing) {
    const existingUser = await findUserByNormalizedPhone(phone);
    if (!existingUser || existing.userId !== existingUser.id) {
      throw new Error("This Telegram account is already linked to another Shauri account");
    }
    return prisma.channelIdentity.update({
      where: { id: existing.id },
      data: { lastUsedAt: new Date() },
      include: { user: true },
    });
  }

  const user = await findUserByNormalizedPhone(phone);
  if (!user) {
    throw new Error("No Shauri account exists for this phone number");
  }

  try {
    return await prisma.channelIdentity.create({
      data: {
        userId: user.id,
        channel: "telegram",
        externalId: input.chatId,
      },
      include: { user: true },
    });
  } catch (error) {
    const racedIdentity = await prisma.channelIdentity.findUnique({
      where: {
        channel_externalId: {
          channel: "telegram",
          externalId: input.chatId,
        },
      },
      include: { user: true },
    });
    if (racedIdentity?.userId === user.id) {
      return prisma.channelIdentity.update({
        where: { id: racedIdentity.id },
        data: { lastUsedAt: new Date() },
        include: { user: true },
      });
    }
    throw error;
  }
}
