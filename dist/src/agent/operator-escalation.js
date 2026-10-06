"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addEscalationNote = addEscalationNote;
exports.sendEscalationUpdate = sendEscalationUpdate;
exports.resolveEscalation = resolveEscalation;
const prisma_1 = require("../infrastructure/prisma");
const send_user_message_1 = require("../messaging/send-user-message");
async function getOpenEscalation(id) {
    const escalation = await prisma_1.prisma.escalation.findUniqueOrThrow({
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
async function addEscalationNote(id, note) {
    const escalation = await getOpenEscalation(id);
    const cleanNote = note.trim();
    if (!cleanNote) {
        throw new Error("Operator note must not be empty");
    }
    return prisma_1.prisma.escalationMessage.create({
        data: {
            escalationId: escalation.id,
            direction: "IN",
            content: cleanNote,
        },
    });
}
async function sendEscalationUpdate(id, message, senders) {
    const escalation = await getOpenEscalation(id);
    const cleanMessage = message.trim();
    if (!cleanMessage) {
        throw new Error("User update must not be empty");
    }
    const delivery = await (0, send_user_message_1.sendUserMessage)(escalation.userId, escalation.user.phone, cleanMessage, senders);
    const [activity, userMessage] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.escalationMessage.create({
            data: {
                escalationId: escalation.id,
                direction: "OUT",
                content: cleanMessage,
            },
        }),
        prisma_1.prisma.message.create({
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
async function resolveEscalation(id, resolutionNote, userMessage, senders) {
    const escalation = await getOpenEscalation(id);
    const cleanNote = resolutionNote.trim();
    if (!cleanNote) {
        throw new Error("Resolution note must not be empty");
    }
    const cleanUserMessage = userMessage?.trim();
    let deliveryChannel;
    if (cleanUserMessage) {
        const delivery = await (0, send_user_message_1.sendUserMessage)(escalation.userId, escalation.user.phone, cleanUserMessage, senders);
        deliveryChannel = delivery.channel;
    }
    return prisma_1.prisma.$transaction(async (tx) => {
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
