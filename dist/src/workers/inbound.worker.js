"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const inbound_message_service_1 = require("../application/inbound-message.service");
const send_1 = require("../whatsapp/send");
const worker = new bullmq_1.Worker("shauri-inbound", async (job) => {
    const result = await (0, inbound_message_service_1.ingestInboundMessage)(job.data);
    if (!result.duplicate && result.reply)
        await (0, send_1.sendWhatsappMessage)(job.data.phone, result.reply);
}, { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379) } });
worker.on("failed", (job, err) => console.error(`Inbound job ${job?.id} failed`, err));
exports.default = worker;
