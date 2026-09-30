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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappWebhookController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = __importDefault(require("node:crypto"));
const bullmq_1 = require("bullmq");
const queue = new bullmq_1.Queue("shauri-inbound", { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });
function verifySignature(raw, signature) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !signature?.startsWith("sha256="))
        return false;
    const expected = node_crypto_1.default.createHmac("sha256", secret).update(raw).digest("hex");
    const supplied = signature.slice(7);
    return supplied.length === expected.length && node_crypto_1.default.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
let WhatsappWebhookController = class WhatsappWebhookController {
    verify(query, res) {
        if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN)
            return res.status(200).send(query["hub.challenge"]);
        return res.sendStatus(403);
    }
    async receive(req, res) {
        const raw = req.rawBody;
        if (!raw || !verifySignature(raw, req.headers["x-hub-signature-256"]))
            return res.sendStatus(401);
        const body = req.body;
        const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message?.id || message?.type !== "text")
            return res.status(200).json({ ok: true });
        const from = message.from;
        const text = message.text?.body ?? "";
        await queue.add("process-inbound", { phone: from, text, externalId: message.id, channel: "whatsapp" }, { jobId: message.id, removeOnComplete: 1000, removeOnFail: 1000 });
        return res.status(200).json({ ok: true });
    }
};
exports.WhatsappWebhookController = WhatsappWebhookController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], WhatsappWebhookController.prototype, "verify", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], WhatsappWebhookController.prototype, "receive", null);
exports.WhatsappWebhookController = WhatsappWebhookController = __decorate([
    (0, common_1.Controller)("webhook/whatsapp")
], WhatsappWebhookController);
