"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTelegramPhone = normalizeTelegramPhone;
exports.linkTelegramIdentity = linkTelegramIdentity;
const prisma_1 = require("../infrastructure/prisma");
async function findUserByNormalizedPhone(phone) {
    const users = await prisma_1.prisma.user.findMany({
        where: { phone: { in: [phone, `+${phone}`] } },
    });
    if (users.length > 1) {
        throw new Error("Multiple Shauri accounts match this phone number");
    }
    return users[0] ?? null;
}
function normalizeTelegramPhone(phone) {
    const normalized = phone.replace(/[\s()-]/g, "").replace(/^\+/, "");
    if (!/^[1-9]\d{6,14}$/.test(normalized)) {
        throw new Error("Telegram contact must provide a valid international phone number");
    }
    return normalized;
}
async function linkTelegramIdentity(input) {
    if (input.contactUserId === undefined ||
        String(input.contactUserId) !== input.senderId) {
        throw new Error("Telegram contact must be shared by the account owner");
    }
    const phone = normalizeTelegramPhone(input.phone);
    const existing = await prisma_1.prisma.channelIdentity.findUnique({
        where: {
            channel_externalId: {
                channel: "telegram",
                externalId: input.chatId,
            },
        },
    });
    if (existing) {
        const existingUser = await findUserByNormalizedPhone(phone);
        if (!existingUser || existing.userId !== existingUser.id) {
            throw new Error("This Telegram account is already linked to another Shauri account");
        }
        return prisma_1.prisma.channelIdentity.update({
            where: { id: existing.id },
            data: { lastUsedAt: new Date() },
            include: { user: true },
        });
    }
    const user = await findUserByNormalizedPhone(phone);
    if (!user) {
        throw new Error("No Shauri account exists for this phone number");
    }
    try {
        return await prisma_1.prisma.channelIdentity.create({
            data: {
                userId: user.id,
                channel: "telegram",
                externalId: input.chatId,
            },
            include: { user: true },
        });
    }
    catch (error) {
        const racedIdentity = await prisma_1.prisma.channelIdentity.findUnique({
            where: {
                channel_externalId: {
                    channel: "telegram",
                    externalId: input.chatId,
                },
            },
            include: { user: true },
        });
        if (racedIdentity?.userId === user.id) {
            return prisma_1.prisma.channelIdentity.update({
                where: { id: racedIdentity.id },
                data: { lastUsedAt: new Date() },
                include: { user: true },
            });
        }
        throw error;
    }
}
