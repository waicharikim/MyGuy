"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramWebhookController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const bullmq_1 = require("bullmq");
const prisma_1 = require("../infrastructure/prisma");
const operator_notification_1 = require("../agent/operator-notification");
const identity_1 = require("./identity");
const job_id_1 = require("./job-id");
const operator_link_1 = require("./operator-link");
const send_1 = require("./send");
const queue = new bullmq_1.Queue("shauri-inbound", {
    connection: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
    },
});
function validSecret(supplied) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    return Boolean(expected &&
        supplied &&
        Buffer.byteLength(expected) === Buffer.byteLength(supplied) &&
        (0, node_crypto_1.timingSafeEqual)(Buffer.from(expected), Buffer.from(supplied)));
}
let TelegramWebhookController = class TelegramWebhookController {
    async receive(request, response) {
        if (!validSecret(request.header("x-telegram-bot-api-secret-token"))) {
            return response.sendStatus(401);
        }
        if (!request.body || typeof request.body !== "object") {
            return response.status(200).json({ ok: true });
        }
        const update = request.body;
        const message = update.message;
        const chatId = message?.chat?.id;
        const senderId = message?.from?.id;
        if (!message ||
            !Number.isSafeInteger(chatId) ||
            !Number.isSafeInteger(senderId) ||
            chatId !== senderId ||
            message.chat?.type !== "private") {
            return response.status(200).json({ ok: true });
        }
        const chat = String(chatId);
        const sender = String(senderId);
        const text = typeof message.text === "string" ? message.text.trim() : "";
        if (text.startsWith("/operator")) {
            const pairingCommand = text.match(/^\/operator(?:@[A-Za-z0-9_]+)?\s+(\S+)$/i);
            const suppliedCode = pairingCommand?.[1];
            if (!suppliedCode ||
                !(0, operator_link_1.isTelegramOperatorSetupCodeValid)(suppliedCode)) {
                await (0, send_1.sendTelegramMessage)(chat, "Operator pairing was not accepted. Check the setup code and try again.");
                return response.status(200).json({ ok: true });
            }
            try {
                await (0, operator_link_1.linkTelegramOperator)(chat);
                await (0, operator_notification_1.retryPendingOperatorNotifications)();
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message.includes("already linked")) {
                    await (0, send_1.sendTelegramMessage)(chat, "Another Telegram chat is already linked as the Shauri operator. Contact an administrator to change it.");
                    return response.status(200).json({ ok: true });
                }
                throw error;
            }
            await (0, send_1.sendTelegramMessage)(chat, "This Telegram chat is now linked for Shauri operator alerts.");
            return response.status(200).json({ ok: true });
        }
        const operator = await (0, operator_link_1.getLinkedTelegramOperator)();
        if (operator?.chatId === chat) {
            if (text === "/start") {
                await (0, send_1.sendTelegramMessage)(chat, "This chat is linked for Shauri operator alerts. Review and respond to handoffs in the Shauri Operator Desk.");
            }
            return response.status(200).json({ ok: true });
        }
        if (message.contact) {
            const phone = message.contact.phone_number;
            if (typeof phone !== "string" || !phone) {
                await (0, send_1.requestTelegramPhone)(chat);
                return response.status(200).json({ ok: true });
            }
            try {
                await (0, identity_1.linkTelegramIdentity)({
                    chatId: chat,
                    senderId: sender,
                    contactUserId: message.contact.user_id,
                    phone,
                });
            }
            catch (error) {
                const text = error instanceof Error &&
                    error.message.includes("shared by the account owner")
                    ? "Please use the button to share your own phone number."
                    : error instanceof Error &&
                        error.message.includes("already linked")
                        ? "This Telegram account is already linked to a different Shauri account. Contact support if you need help."
                        : error instanceof Error &&
                            error.message.includes("valid international")
                            ? "Please share a valid international phone number."
                            : error instanceof Error &&
                                error.message.includes("No Shauri account")
                                ? "I couldn't find a Shauri account for that number. Start a conversation with Shauri on WhatsApp first, then share your number here to link your history."
                                : error instanceof Error &&
                                    error.message.includes("Multiple Shauri accounts")
                                    ? "I couldn't safely match that number to one Shauri account. Please contact support to resolve the duplicate accounts."
                                    : null;
                if (!text) {
                    throw error;
                }
                await (0, send_1.sendTelegramMessage)(chat, text);
                return response.status(200).json({ ok: true });
            }
            await (0, send_1.sendTelegramMessage)(chat, "Your Telegram account is linked to Shauri. Send a message whenever you want to work through a decision.", { remove_keyboard: true });
            return response.status(200).json({ ok: true });
        }
        const identity = await prisma_1.prisma.channelIdentity.findUnique({
            where: {
                channel_externalId: {
                    channel: "telegram",
                    externalId: chat,
                },
            },
            include: { user: true },
        });
        if (!identity) {
            await (0, send_1.requestTelegramPhone)(chat);
            return response.status(200).json({ ok: true });
        }
        if (text === "/start" || text === "/link") {
            await (0, send_1.sendTelegramMessage)(chat, "Your Telegram account is already linked. Send a message to continue.");
            return response.status(200).json({ ok: true });
        }
        if (typeof message.text !== "string" ||
            !message.text.trim() ||
            typeof message.message_id !== "number" ||
            !Number.isSafeInteger(message.message_id)) {
            await (0, send_1.sendTelegramMessage)(chat, "Please send your decision as a text message.");
            return response.status(200).json({ ok: true });
        }
        await prisma_1.prisma.channelIdentity.update({
            where: { id: identity.id },
            data: { lastUsedAt: new Date() },
        });
        const externalId = `${chat}:${message.message_id}`;
        await queue.add("process-inbound", {
            phone: identity.user.phone,
            text: message.text,
            externalId,
            channel: "telegram",
            telegramChatId: chat,
        }, {
            jobId: (0, job_id_1.telegramJobId)(chat, message.message_id),
            removeOnComplete: 1000,
            removeOnFail: 1000,
        });
        return response.status(200).json({ ok: true });
    }
};
exports.TelegramWebhookController = TelegramWebhookController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TelegramWebhookController.prototype, "receive", null);
exports.TelegramWebhookController = TelegramWebhookController = __decorate([
    (0, common_1.Controller)("webhook/telegram")
], TelegramWebhookController);
