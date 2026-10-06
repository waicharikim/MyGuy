import { prisma } from "../infrastructure/prisma";
import { sendWhatsappMessage } from "../whatsapp/send";
import { sendTelegramMessage } from "../telegram/send";

export type UserMessageSenders = {
  whatsapp: (phone: string, message: string) => Promise<unknown>;
  telegram: (chatId: string, message: string) => Promise<unknown>;
};

const defaultSenders: UserMessageSenders = {
  whatsapp: sendWhatsappMessage,
  telegram: sendTelegramMessage,
};

export async function sendUserMessage(
  userId: string,
  fallbackPhone: string,
  message: string,
  senders: UserMessageSenders = defaultSenders,
) {
  const identity = await prisma.channelIdentity.findFirst({
    where: { userId },
    orderBy: { lastUsedAt: "desc" },
  });

  if (identity?.channel === "telegram") {
    await senders.telegram(identity.externalId, message);
    return { channel: "telegram" };
  }

  await senders.whatsapp(identity?.externalId || fallbackPhone, message);
  return { channel: "whatsapp" };
}
