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
exports.MpesaCallbackController = void 0;
const common_1 = require("@nestjs/common");
const prisma_1 = require("../infrastructure/prisma");
const graph_1 = require("../agent/graph");
const context_1 = require("../agent/context");
const send_1 = require("../whatsapp/send");
let MpesaCallbackController = class MpesaCallbackController {
    async handleCallback(body) {
        const callback = body?.Body?.stkCallback;
        if (!callback?.CheckoutRequestID)
            return { ResultCode: 0, ResultDesc: "ignored" };
        const payment = await prisma_1.prisma.payment.findUnique({ where: { checkoutRequestId: callback.CheckoutRequestID }, include: { user: true } });
        if (!payment)
            return { ResultCode: 0, ResultDesc: "no matching payment" };
        if (payment.status === "SUCCESS" && payment.threadId)
            return { ResultCode: 0, ResultDesc: "already processed" };
        if (callback.ResultCode !== 0) {
            await prisma_1.prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
            await (0, send_1.sendWhatsappMessage)(payment.user.phone, "The M-Pesa payment did not complete, so I haven't started the decision session. You can try again when you're ready.").catch(console.error);
            return { ResultCode: 0, ResultDesc: "recorded failure" };
        }
        const receipt = callback.CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
            if (current.status === "SUCCESS" && current.threadId)
                return { threadId: current.threadId, userId: current.userId, originalMessage: current.originalMessage, already: true };
            const thread = await tx.thread.create({ data: { userId: current.userId } });
            await tx.payment.update({ where: { id: current.id }, data: { status: "SUCCESS", mpesaReceipt: receipt ? String(receipt) : null, threadId: thread.id } });
            await tx.message.create({ data: { threadId: thread.id, direction: "IN", content: current.originalMessage, channel: "whatsapp", externalId: current.externalMessageId } });
            return { threadId: thread.id, userId: current.userId, originalMessage: current.originalMessage, already: false };
        });
        if (!result.already) {
            const reply = await (0, graph_1.runShauriGraph)({ threadId: result.threadId, userId: result.userId, rawInput: result.originalMessage, injectedContext: await (0, context_1.buildInjectedContext)(result.userId, result.originalMessage) });
            await prisma_1.prisma.message.create({ data: { threadId: result.threadId, direction: "OUT", content: reply.reply, channel: "whatsapp" } });
            await (0, send_1.sendWhatsappMessage)(payment.user.phone, reply.reply);
            if (payment.externalMessageId)
                await prisma_1.prisma.inboundReceipt.updateMany({ where: { channel: "whatsapp", externalId: payment.externalMessageId }, data: { processedAt: new Date() } });
        }
        return { ResultCode: 0, ResultDesc: "success" };
    }
};
exports.MpesaCallbackController = MpesaCallbackController;
__decorate([
    (0, common_1.Post)("callback"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MpesaCallbackController.prototype, "handleCallback", null);
exports.MpesaCallbackController = MpesaCallbackController = __decorate([
    (0, common_1.Controller)("webhook/mpesa")
], MpesaCallbackController);
