import { Controller, Post, Body } from "@nestjs/common";
import { prisma } from "../infrastructure/prisma";
import { runShauriGraph } from "../agent/graph";
import { buildInjectedContext } from "../agent/context";
import { sendUserMessage } from "../messaging/send-user-message";

@Controller("webhook/mpesa")
export class MpesaCallbackController {
  @Post("callback")
  async handleCallback(@Body() body: any) {
    const callback = body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) return { ResultCode: 0, ResultDesc: "ignored" };
    const payment = await prisma.payment.findUnique({ where: { checkoutRequestId: callback.CheckoutRequestID }, include: { user: true } });
    if (!payment) return { ResultCode: 0, ResultDesc: "no matching payment" };
    if (payment.status === "SUCCESS" && payment.threadId) return { ResultCode: 0, ResultDesc: "already processed" };
    if (callback.ResultCode !== 0) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      await sendUserMessage(payment.userId, payment.user.phone, "The M-Pesa payment did not complete, so I haven't started the decision session. You can try again when you're ready.").catch(console.error);
      return { ResultCode: 0, ResultDesc: "recorded failure" };
    }
    const receipt = callback.CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value;
    const result = await prisma.$transaction(async tx => {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const inboundReceipt = current.externalMessageId
        ? await tx.inboundReceipt.findFirst({ where: { externalId: current.externalMessageId } })
        : null;
      const channel = inboundReceipt?.channel ?? "whatsapp";
      if (current.status === "SUCCESS" && current.threadId) return { threadId: current.threadId, userId: current.userId, originalMessage: current.originalMessage, channel, already: true };
      const thread = await tx.thread.create({ data: { userId: current.userId } });
      await tx.payment.update({ where: { id: current.id }, data: { status: "SUCCESS", mpesaReceipt: receipt ? String(receipt) : null, threadId: thread.id } });
      await tx.message.create({ data: { threadId: thread.id, direction: "IN", content: current.originalMessage, channel, externalId: current.externalMessageId } });
      return { threadId: thread.id, userId: current.userId, originalMessage: current.originalMessage, channel, already: false };
    });
    if (!result.already) {
      const reply = await runShauriGraph({ threadId: result.threadId, userId: result.userId, rawInput: result.originalMessage, injectedContext: await buildInjectedContext(result.userId, result.originalMessage) });
      const delivery = await sendUserMessage(payment.userId, payment.user.phone, reply.reply);
      await prisma.message.create({ data: { threadId: result.threadId, direction: "OUT", content: reply.reply, channel: delivery.channel } });
      if (payment.externalMessageId) {
        await prisma.inboundReceipt.updateMany({ where: { channel: result.channel, externalId: payment.externalMessageId }, data: { processedAt: new Date() } });
      }
    }
    return { ResultCode: 0, ResultDesc: "success" };
  }
}
