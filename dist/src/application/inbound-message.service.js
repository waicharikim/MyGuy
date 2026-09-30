"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestInboundMessage = ingestInboundMessage;
const prisma_1 = require("../infrastructure/prisma");
const message_processor_1 = require("./message-processor");
async function ingestInboundMessage(input) {
    const channel = input.channel ?? "whatsapp";
    const existing = await prisma_1.prisma.inboundReceipt.findUnique({ where: { channel_externalId: { channel, externalId: input.externalId } } });
    if (existing?.processedAt)
        return { duplicate: true, reply: null };
    if (!existing) {
        try {
            await prisma_1.prisma.inboundReceipt.create({ data: { channel, externalId: input.externalId, phone: input.phone, text: input.text } });
        }
        catch {
            return { duplicate: true, reply: null };
        }
    }
    const user = await prisma_1.prisma.user.upsert({ where: { phone: input.phone }, update: {}, create: { phone: input.phone } });
    try {
        const result = await (0, message_processor_1.processMessage)({ userId: user.id, phone: input.phone, text: input.text, externalId: input.externalId, channel });
        await prisma_1.prisma.inboundReceipt.update({ where: { channel_externalId: { channel, externalId: input.externalId } }, data: { processedAt: new Date() } });
        return result;
    }
    catch (error) {
        console.error("Inbound message processing failed", error);
        throw error;
    }
}
