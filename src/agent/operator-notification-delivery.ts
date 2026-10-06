import { prisma } from "../infrastructure/prisma";
import { getLinkedTelegramOperator } from "../telegram/operator-link";
import { sendTelegramMessage } from "../telegram/send";
import { sendWhatsappMessage } from "../whatsapp/send";

type WhatsappSender = (
  phone: string,
  message: string,
  options: { required: true },
) => Promise<void>;

function operatorDeskLink() {
  const configured = process.env.OPERATOR_DASHBOARD_URL?.trim();
  if (!configured) {
    return null;
  }
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.pathname.replace(/\/$/, "") !== "/internal/human/dashboard" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return url.href;
  } catch {
    throw new Error(
      "OPERATOR_DASHBOARD_URL must be an HTTPS URL ending in /internal/human/dashboard",
    );
  }
}

export async function deliverOperatorNotification(
  notificationId: string,
  send: WhatsappSender = sendWhatsappMessage,
  sendTelegram: (
    chatId: string,
    message: string,
  ) => Promise<unknown> = sendTelegramMessage,
  getTelegramOperator = getLinkedTelegramOperator,
) {
  const notification = await prisma.operatorNotification.findUnique({
    where: { id: notificationId },
    include: {
      humanQuery: { include: { user: true } },
      escalation: {
        include: {
          user: true,
          thread: {
            select: {
              decisionSummary: true,
              decisionRecords: {
                take: 1,
                select: { matter: true },
              },
            },
          },
        },
      },
    },
  });

  if (!notification || notification.sentAt) {
    return;
  }

  const handoff =
    notification.type === "HUMAN_QUERY" && notification.humanQuery
      ? [
          "Shauri needs an operator response.",
          `Matter: ${notification.humanQuery.matter}`,
          `Question: ${notification.humanQuery.question}`,
          `Reason: ${notification.humanQuery.reason}`,
          `User: ${notification.humanQuery.user.phone}`,
        ].join("\n")
      : notification.type === "ESCALATION" && notification.escalation
        ? [
            "Shauri has escalated a decision for human review.",
            `Matter: ${notification.escalation.thread.decisionRecords[0]?.matter || notification.escalation.thread.decisionSummary || notification.escalation.threadId}`,
            `Reason: ${notification.escalation.reason}`,
            `User: ${notification.escalation.user.phone}`,
          ].join("\n")
        : null;

  if (!handoff) {
    throw new Error(`Operator notification ${notification.id} has no valid handoff`);
  }
  const dashboardUrl = operatorDeskLink();
  const message = dashboardUrl
    ? `${handoff}\nOperator Desk: ${dashboardUrl}`
    : handoff;

  await prisma.operatorNotification.update({
    where: { id: notification.id },
    data: { attempts: { increment: 1 }, lastError: null },
  });
  try {
    const telegramOperator = await getTelegramOperator();
    if (telegramOperator) {
      await sendTelegram(telegramOperator.chatId, message);
    } else {
      const operatorPhone = process.env.OPERATOR_WHATSAPP_PHONE;
      if (!operatorPhone) {
        throw new Error(
          "No operator delivery channel is configured; pair Telegram with /operator <setup-code> or set OPERATOR_WHATSAPP_PHONE",
        );
      }
      await send(operatorPhone, message, { required: true });
    }
  } catch (error) {
    await prisma.operatorNotification.update({
      where: { id: notification.id },
      data: {
        lastError: error instanceof Error ? error.message : String(error),
        nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    throw error;
  }

  return prisma.operatorNotification.update({
    where: { id: notification.id },
    data: { sentAt: new Date(), lastError: null },
  });
}
