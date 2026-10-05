import { Prisma } from "@prisma/client";
import { prisma } from "../infrastructure/prisma";

export async function requestAgentInteraction(input: {
  requesterAgent: string;
  responderAgent: string;
  capability: string;
  threadId?: string;
  request: Prisma.InputJsonValue;
}) {
  const [requester, responder] = await Promise.all([
    prisma.agent.findUnique({ where: { name: input.requesterAgent } }),
    prisma.agent.findUnique({ where: { name: input.responderAgent } }),
  ]);
  if (!requester || !responder || !requester.enabled || !responder.enabled) {
    throw new Error("Agent unavailable");
  }
  if (input.threadId) {
    if (!requester.ownerUserId) {
      throw new Error("System agents cannot attach user thread context");
    }
    const thread = await prisma.thread.findUnique({
      where: { id: input.threadId },
      select: { userId: true },
    });
    if (!thread || thread.userId !== requester.ownerUserId) {
      throw new Error("Interaction thread is outside the requester agent's scope");
    }
  }
  const capability = await prisma.agentCapability.findFirst({
    where: { agentId: responder.id, name: input.capability, enabled: true },
  });
  const permission = await prisma.agentPermission.findUnique({
    where: {
      requesterAgentId_responderAgentId_capability: {
        requesterAgentId: requester.id,
        responderAgentId: responder.id,
        capability: input.capability,
      },
    },
  });
  if (!capability || !permission?.allowed) {
    throw new Error("Agent interaction not permitted");
  }
  return prisma.agentInteraction.create({
    data: {
      requesterId: requester.id,
      responderId: responder.id,
      capability: input.capability,
      threadId: input.threadId,
      request: input.request,
      messages: {
        create: {
          direction: "OUT",
          content: JSON.stringify(input.request),
        },
      },
    },
  });
}

export async function answerAgentInteraction(
  interactionId: string,
  responderAgentName: string,
  response: Prisma.InputJsonValue,
) {
  return prisma.$transaction(async (tx) => {
    const interaction = await tx.agentInteraction.findUnique({
      where: { id: interactionId },
      include: { responder: true },
    });
    if (!interaction || interaction.responder.name !== responderAgentName) {
      throw new Error("Interaction is not assigned to this responder agent");
    }
    if (interaction.status !== "REQUESTED") {
      throw new Error("Only a requested interaction can be answered");
    }

    const claimed = await tx.agentInteraction.updateMany({
      where: { id: interactionId, status: "REQUESTED" },
      data: { status: "ANSWERED", response, completedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new Error("Interaction has already been answered");
    }
    await tx.agentInteractionMessage.create({
      data: {
        interactionId,
        direction: "IN",
        content: JSON.stringify(response),
      },
    });
    return tx.agentInteraction.findUniqueOrThrow({
      where: { id: interactionId },
    });
  });
}