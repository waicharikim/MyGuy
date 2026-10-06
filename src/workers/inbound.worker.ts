import { Worker } from "bullmq";
import { ingestInboundMessage } from "../application/inbound-message.service";
import { sendWhatsappMessage } from "../whatsapp/send";
import { sendTelegramMessage } from "../telegram/send";

const worker = new Worker("shauri-inbound", async job => {
  const result = await ingestInboundMessage(job.data);
  if (!result.duplicate && result.reply) {
    if (job.data.channel === "telegram") {
      await sendTelegramMessage(job.data.telegramChatId, result.reply);
    } else {
      await sendWhatsappMessage(job.data.phone, result.reply);
    }
  }
}, { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });
worker.on("failed", (job, err) => console.error(`Inbound job ${job?.id} failed`, err));
export default worker;
