"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const webhook_controller_1 = require("./whatsapp/webhook.controller");
const mpesa_callback_controller_1 = require("./payments/mpesa-callback.controller");
const human_controller_1 = require("./human.controller");
const health_controller_1 = require("./health.controller");
const telegram_webhook_controller_1 = require("./telegram/telegram-webhook.controller");
const pa_controller_1 = require("./pa/pa.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [
            webhook_controller_1.WhatsappWebhookController,
            mpesa_callback_controller_1.MpesaCallbackController,
            human_controller_1.HumanController,
            health_controller_1.HealthController,
            telegram_webhook_controller_1.TelegramWebhookController,
            pa_controller_1.PaController,
        ],
    })
], AppModule);
