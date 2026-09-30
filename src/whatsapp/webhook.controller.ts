import { Controller, Get, Post, Query, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import crypto from "node:crypto";
import { Queue } from "bullmq";

const queue = new Queue("shauri-inbound", { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });

function verifySignature(raw: Buffer, signature?: string) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const supplied = signature.slice(7);
  return supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

@Controller("webhook/whatsapp")
export class WhatsappWebhookController {
  @Get()
  verify(@Query() query: any, @Res() res: Response) {
    if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(query["hub.challenge"]);
    return res.sendStatus(403);
  }

  @Post()
  async receive(@Req() req: Request, @Res() res: Response) {
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw || !verifySignature(raw, req.headers["x-hub-signature-256"] as string | undefined)) return res.sendStatus(401);
    const body = req.body as any;
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message?.id || message?.type !== "text") return res.status(200).json({ ok: true });
    const from = message.from;
    const text = message.text?.body ?? "";
    await queue.add("process-inbound", { phone: from, text, externalId: message.id, channel: "whatsapp" }, { jobId: message.id, removeOnComplete: 1000, removeOnFail: 1000 });
    return res.status(200).json({ ok: true });
  }
}
