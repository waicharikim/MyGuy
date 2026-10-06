import { Module } from "@nestjs/common";
import { WhatsappWebhookController } from "./whatsapp/webhook.controller";
import { MpesaCallbackController } from "./payments/mpesa-callback.controller";
import { HumanController } from "./human.controller";
import { HealthController } from "./health.controller";
import { TelegramWebhookController } from "./telegram/telegram-webhook.controller";
import { PaController } from "./pa/pa.controller";

@Module({
  controllers: [
    WhatsappWebhookController,
    MpesaCallbackController,
    HumanController,
    HealthController,
    TelegramWebhookController,
    PaController,
  ],
})
export class AppModule {}
