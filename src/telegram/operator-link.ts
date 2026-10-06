import { timingSafeEqual } from "node:crypto";
import { prisma } from "../infrastructure/prisma";

export function isTelegramOperatorSetupCodeValid(
  supplied: string,
  expected = process.env.TELEGRAM_OPERATOR_SETUP_CODE,
) {
  return Boolean(
    expected &&
      expected.length >= 32 &&
      Buffer.byteLength(expected) === Buffer.byteLength(supplied) &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)),
  );
}

export async function getLinkedTelegramOperator() {
  return prisma.telegramOperator.findUnique({ where: { id: "primary" } });
}

export async function linkTelegramOperator(chatId: string) {
  const existing = await getLinkedTelegramOperator();
  if (existing && existing.chatId !== chatId) {
    throw new Error(
      "A different Telegram operator chat is already linked; unlink it before pairing another.",
    );
  }
  if (existing) {
    return existing;
  }

  try {
    return await prisma.telegramOperator.create({
      data: { id: "primary", chatId },
    });
  } catch (error) {
    const raced = await getLinkedTelegramOperator();
    if (raced?.chatId === chatId) {
      return raced;
    }
    throw error;
  }
}
