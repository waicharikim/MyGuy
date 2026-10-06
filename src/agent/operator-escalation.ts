import { prisma } from "../infrastructure/prisma";
import { sendUserMessage, type UserMessageSenders } from "../messaging/send-user-message";

async function getOpenEscalation(id: string) {
  const escalation = await prisma.escalation.findUniqueOrThrow({
    where: { id },
    include: {
      user: { select: { phone: true } },
    },
  });
  if (escalation.status !== "OPEN") {
    throw new Error("Escalation is no longer open");
  }
  return escalation;
}

export async function addEscalationNote(id: string, note: string) {
  const escalation = await getOpenEscalation(id);
  const cleanNote = note.trim();
  if (!cleanNote) {
    throw new Error("Operator note must not be empty");
  }
  return prisma.escalationMessage.create({
    data: {
      escalationId: escalation.id,
      direction: "IN",
      content: cleanNote,
    },
  });
}

export async function sendEscalationUpdate(
  id: string,
  message: string,
  senders?: UserMessageSenders,
) {
  const escalation = await getOpenEscalation(id);
  const cleanMessage = message.trim();
  if (!cleanMessage) {
    throw new Error("User update must not be empty");
  }

  const delivery = await sendUserMessage(
    escalation.userId,
    escalation.user.phone,
    cleanMessage,
    senders,
  );

  const [activity, userMessage] = await prisma.$transaction([
    prisma.escalationMessage.create({
      data: {
        escalationId: escalation.id,
        direction: "OUT",
        content: cleanMessage,
      },
    }),
    prisma.message.create({
      data: {
        threadId: escalation.threadId,
        direction: "OUT",
        channel: delivery.channel,
        content: cleanMessage,
        metadata: {
          source: "human_operator",
          escalationId: escalation.id,
        },
      },
    }),
  ]);

  return { activity, userMessage, channel: delivery.channel };
}

export async function resolveEscalation(
  id: string,
  resolutionNote: string,
  userMessage?: string,
  senders?: UserMessageSenders,
) {
  const escalation = await getOpenEscalation(id);
  const cleanNote = resolutionNote.trim();
  if (!cleanNote) {
    throw new Error("Resolution note must not be empty");
  }

  const cleanUserMessage = userMessage?.trim();
  let deliveryChannel: string | undefined;
  if (cleanUserMessage) {
    const delivery = await sendUserMessage(
      escalation.userId,
      escalation.user.phone,
      cleanUserMessage,
      senders,
    );
    deliveryChannel = delivery.channel;
  }

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.escalation.updateMany({
      where: { id: escalation.id, status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new Error("Escalation is no longer open");
    }

    const resolved = await tx.escalation.findUniqueOrThrow({
      where: { id: escalation.id },
    });
    await tx.escalationMessage.create({
      data: {
        escalationId: escalation.id,
        direction: "IN",
        content: cleanNote,
      },
    });
    if (cleanUserMessage) {
      await tx.escalationMessage.create({
        data: {
          escalationId: escalation.id,
          direction: "OUT",
          content: cleanUserMessage,
        },
      });
      await tx.message.create({
        data: {
          threadId: escalation.threadId,
          direction: "OUT",
          channel: deliveryChannel,
          content: cleanUserMessage,
          metadata: {
            source: "human_operator",
            escalationId: escalation.id,
          },
        },
      });
    }
    await tx.thread.updateMany({
      where: { id: escalation.threadId, status: "ESCALATED" },
      data: {
        status: "OPEN",
        closedAt: null,
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: "NONE",
      },
    });
    await tx.decisionRecord.updateMany({
      where: {
        threadId: escalation.threadId,
        status: "ESCALATED",
      },
      data: {
        status: "OPEN",
        closedAt: null,
      },
    });
    return resolved;
  });
}
