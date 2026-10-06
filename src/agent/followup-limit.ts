import { prisma } from "../infrastructure/prisma";

export async function stopFollowupsAtLimit(
  followupId: string,
  threadId: string,
) {
  await prisma.$transaction([
    prisma.thread.updateMany({
      where: { id: threadId, status: "OPEN" },
      data: {
        awaitingReply: false,
        outcomeRequestedAt: null,
        outcomeSelectionPending: false,
        outcomeSelectedForReply: false,
      },
    }),
    prisma.scheduledFollowup.update({
      where: { id: followupId },
      data: { status: "CANCELLED" },
    }),
  ]);
}
