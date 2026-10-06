"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopFollowupsAtLimit = stopFollowupsAtLimit;
const prisma_1 = require("../infrastructure/prisma");
async function stopFollowupsAtLimit(followupId, threadId) {
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.thread.updateMany({
            where: { id: threadId, status: "OPEN" },
            data: {
                awaitingReply: false,
                outcomeRequestedAt: null,
                outcomeSelectionPending: false,
                outcomeSelectedForReply: false,
            },
        }),
        prisma_1.prisma.scheduledFollowup.update({
            where: { id: followupId },
            data: { status: "CANCELLED" },
        }),
    ]);
}
