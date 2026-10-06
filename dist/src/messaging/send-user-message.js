"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendUserMessage = sendUserMessage;
const prisma_1 = require("../infrastructure/prisma");
const send_1 = require("../whatsapp/send");
const send_2 = require("../telegram/send");
const defaultSenders = {
    whatsapp: send_1.sendWhatsappMessage,
    telegram: send_2.sendTelegramMessage,
};
async function sendUserMessage(userId, fallbackPhone, message, senders = defaultSenders) {
    const identity = await prisma_1.prisma.channelIdentity.findFirst({
        where: { userId },
        orderBy: { lastUsedAt: "desc" },
    });
    if (identity?.channel === "telegram") {
        await senders.telegram(identity.externalId, message);
        return { channel: "telegram" };
    }
    await senders.whatsapp(identity?.externalId || fallbackPhone, message);
    return { channel: "whatsapp" };
}
