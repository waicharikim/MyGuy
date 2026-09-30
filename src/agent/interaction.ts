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
    },
  });
}

export async function answerAgentInteraction(
  interactionId: string,
  response: Prisma.InputJsonValue
) {
  return prisma.agentInteraction.update({
    where: { id: interactionId },
    data: { response, status: "ANSWERED", completedAt: new Date() },
  });
}