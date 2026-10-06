import { Controller, Post, Req, Res } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { Queue } from "bullmq";
import { prisma } from "../infrastructure/prisma";
import { retryPendingOperatorNotifications } from "../agent/operator-notification";
import { linkTelegramIdentity } from "./identity";
import { telegramJobId } from "./job-id";
import {
  getLinkedTelegramOperator,
  isTelegramOperatorSetupCodeValid,
  linkTelegramOperator,
} from "./operator-link";
import { requestTelegramPhone, sendTelegramMessage } from "./send";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number; type?: string };
    from?: { id?: number };
    text?: string;
    contact?: {
      phone_number?: string;
      user_id?: number;
    };
  };
};

const queue = new Queue("shauri-inbound", {
  connection: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
  },
});

function validSecret(supplied: string | undefined) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  return Boolean(
    expected &&
      supplied &&
      Buffer.byteLength(expected) === Buffer.byteLength(supplied) &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)),
  );
}

@Controller("webhook/telegram")
export class TelegramWebhookController {
  @Post()
  async receive(@Req() request: Request, @Res() response: Response) {
    if (!validSecret(request.header("x-telegram-bot-api-secret-token"))) {
      return response.sendStatus(401);
    }

    if (!request.body || typeof request.body !== "object") {
      return response.status(200).json({ ok: true });
    }
    const update = request.body as TelegramUpdate;
    const message = update.message;
    const chatId = message?.chat?.id;
    const senderId = message?.from?.id;
    if (
      !message ||
      !Number.isSafeInteger(chatId) ||
      !Number.isSafeInteger(senderId) ||
      chatId !== senderId ||
      message.chat?.type !== "private"
    ) {
      return response.status(200).json({ ok: true });
    }

    const chat = String(chatId);
    const sender = String(senderId);
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (text.startsWith("/operator")) {
      const pairingCommand = text.match(
        /^\/operator(?:@[A-Za-z0-9_]+)?\s+(\S+)$/i,
      );
      const suppliedCode = pairingCommand?.[1];
      if (
        !suppliedCode ||
        !isTelegramOperatorSetupCodeValid(suppliedCode)
      ) {
        await sendTelegramMessage(
          chat,
          "Operator pairing was not accepted. Check the setup code and try again.",
        );
        return response.status(200).json({ ok: true });
      }
      try {
        await linkTelegramOperator(chat);
        await retryPendingOperatorNotifications();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("already linked")
        ) {
          await sendTelegramMessage(
            chat,
            "Another Telegram chat is already linked as the Shauri operator. Contact an administrator to change it.",
          );
          return response.status(200).json({ ok: true });
        }
        throw error;
      }
      await sendTelegramMessage(
        chat,
        "This Telegram chat is now linked for Shauri operator alerts.",
      );
      return response.status(200).json({ ok: true });
    }

    const operator = await getLinkedTelegramOperator();
    if (operator?.chatId === chat) {
      if (text === "/start") {
        await sendTelegramMessage(
          chat,
          "This chat is linked for Shauri operator alerts. Review and respond to handoffs in the Shauri Operator Desk.",
        );
      }
      return response.status(200).json({ ok: true });
    }

    if (message.contact) {
      const phone = message.contact.phone_number;
      if (typeof phone !== "string" || !phone) {
        await requestTelegramPhone(chat);
        return response.status(200).json({ ok: true });
      }
      try {
        await linkTelegramIdentity({
          chatId: chat,
          senderId: sender,
          contactUserId: message.contact.user_id,
          phone,
        });
      } catch (error) {
        const text =
          error instanceof Error &&
          error.message.includes("shared by the account owner")
            ? "Please use the button to share your own phone number."
            : error instanceof Error &&
                error.message.includes("already linked")
              ? "This Telegram account is already linked to a different Shauri account. Contact support if you need help."
              : error instanceof Error &&
                  error.message.includes("valid international")
                ? "Please share a valid international phone number."
                  : error instanceof Error &&
                      error.message.includes("No Shauri account")
                    ? "I couldn't find a Shauri account for that number. Start a conversation with Shauri on WhatsApp first, then share your number here to link your history."
                    : error instanceof Error &&
                        error.message.includes("Multiple Shauri accounts")
                      ? "I couldn't safely match that number to one Shauri account. Please contact support to resolve the duplicate accounts."
                    : null;
        if (!text) {
          throw error;
        }
        await sendTelegramMessage(chat, text);
        return response.status(200).json({ ok: true });
      }
      await sendTelegramMessage(
        chat,
        "Your Telegram account is linked to Shauri. Send a message whenever you want to work through a decision.",
        { remove_keyboard: true },
      );
      return response.status(200).json({ ok: true });
    }

    const identity = await prisma.channelIdentity.findUnique({
      where: {
        channel_externalId: {
          channel: "telegram",
          externalId: chat,
        },
      },
      include: { user: true },
    });
    if (!identity) {
      await requestTelegramPhone(chat);
      return response.status(200).json({ ok: true });
    }
    if (text === "/start" || text === "/link") {
      await sendTelegramMessage(
        chat,
        "Your Telegram account is already linked. Send a message to continue.",
      );
      return response.status(200).json({ ok: true });
    }
    if (
      typeof message.text !== "string" ||
      !message.text.trim() ||
      typeof message.message_id !== "number" ||
      !Number.isSafeInteger(message.message_id)
    ) {
      await sendTelegramMessage(chat, "Please send your decision as a text message.");
      return response.status(200).json({ ok: true });
    }

    await prisma.channelIdentity.update({
      where: { id: identity.id },
      data: { lastUsedAt: new Date() },
    });
    const externalId = `${chat}:${message.message_id}`;
    await queue.add(
      "process-inbound",
      {
        phone: identity.user.phone,
        text: message.text,
        externalId,
        channel: "telegram",
        telegramChatId: chat,
      },
      {
        jobId: telegramJobId(chat, message.message_id),
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
    return response.status(200).json({ ok: true });
  }
}
