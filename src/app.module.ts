import { Module } from "@nestjs/common";
import { WhatsappWebhookController } from "./whatsapp/webhook.controller";
import { MpesaCallbackController } from "./payments/mpesa-callback.controller";
import { HumanController } from "./human.controller";

@Module({ controllers: [WhatsappWebhookController, MpesaCallbackController, HumanController] })
export class AppModule {}
