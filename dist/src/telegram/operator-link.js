"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTelegramOperatorSetupCodeValid = isTelegramOperatorSetupCodeValid;
exports.getLinkedTelegramOperator = getLinkedTelegramOperator;
exports.linkTelegramOperator = linkTelegramOperator;
const node_crypto_1 = require("node:crypto");
const prisma_1 = require("../infrastructure/prisma");
function isTelegramOperatorSetupCodeValid(supplied, expected = process.env.TELEGRAM_OPERATOR_SETUP_CODE) {
    return Boolean(expected &&
        expected.length >= 32 &&
        Buffer.byteLength(expected) === Buffer.byteLength(supplied) &&
        (0, node_crypto_1.timingSafeEqual)(Buffer.from(expected), Buffer.from(supplied)));
}
async function getLinkedTelegramOperator() {
    return prisma_1.prisma.telegramOperator.findUnique({ where: { id: "primary" } });
}
async function linkTelegramOperator(chatId) {
    const existing = await getLinkedTelegramOperator();
    if (existing && existing.chatId !== chatId) {
        throw new Error("A different Telegram operator chat is already linked; unlink it before pairing another.");
    }
    if (existing) {
        return existing;
    }
    try {
        return await prisma_1.prisma.telegramOperator.create({
            data: { id: "primary", chatId },
        });
    }
    catch (error) {
        const raced = await getLinkedTelegramOperator();
        if (raced?.chatId === chatId) {
            return raced;
        }
        throw error;
    }
}
