import { Worker } from "bullmq";
import { ingestInboundMessage } from "../application/inbound-message.service";
import { sendWhatsappMessage } from "../whatsapp/send";

const worker = new Worker("shauri-inbound", async job => {
  const result = await ingestInboundMessage(job.data);
  if (!result.duplicate && result.reply) await sendWhatsappMessage(job.data.phone, result.reply);
}, { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });
worker.on("failed", (job, err) => console.error(`Inbound job ${job?.id} failed`, err));
export default worker;
