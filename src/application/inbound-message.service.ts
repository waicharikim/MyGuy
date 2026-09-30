import { prisma } from "../infrastructure/prisma";
import { processMessage } from "./message-processor";

export async function ingestInboundMessage(input: { phone: string; text: string; externalId: string; channel?: string }) {
  const channel = input.channel ?? "whatsapp";
  const existing = await prisma.inboundReceipt.findUnique({ where: { channel_externalId: { channel, externalId: input.externalId } } });
  if (existing?.processedAt) return { duplicate: true, reply: null as string | null };
  if (!existing) {
    try { await prisma.inboundReceipt.create({ data: { channel, externalId: input.externalId, phone: input.phone, text: input.text } }); }
    catch { return { duplicate: true, reply: null as string | null }; }
  }
  const user = await prisma.user.upsert({ where: { phone: input.phone }, update: {}, create: { phone: input.phone } });
  try {
    const result = await processMessage({ userId: user.id, phone: input.phone, text: input.text, externalId: input.externalId, channel });
    await prisma.inboundReceipt.update({ where: { channel_externalId: { channel, externalId: input.externalId } }, data: { processedAt: new Date() } });
    return result;
  } catch (error) {
    console.error("Inbound message processing failed", error);
    throw error;
  }
}
