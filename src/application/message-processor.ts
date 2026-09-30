import { prisma } from "../infrastructure/prisma";
import { resolveThread } from "./thread-resolver";
import { createTask } from "../tools/create_task";
import { createNote } from "../tools/create_note";
import { notifyEscalation } from "../agent/escalation";
import { runShauriGraph } from "../agent/graph";
import { routeMessage } from "../agent/router";
import { buildInjectedContext } from "../agent/context";
import { initiateSTKPush } from "../tools/mpesa";

export async function processMessage(input: { userId: string; phone: string; text: string; externalId?: string; channel: string }) {
  const route = await routeMessage(input.userId, input.text);
  if (route.intent === "task_create") { await createTask({ userId: input.userId, description: route.extracted || input.text }); return { duplicate: false, reply: `Task saved: "${route.extracted || input.text}"` }; }
  if (route.intent === "note_create") { await createNote({ userId: input.userId, content: route.extracted || input.text }); return { duplicate: false, reply: "Noted." }; }
  if (route.intent === "finance_query") return { duplicate: false, reply: "Financial account reads are not enabled yet. I can still help you reason through a financial decision." };
  if (route.intent === "escalation_request") {
    const resolution = await resolveThread(input.userId, input.text);
    if (resolution.type === "existing") {
      await notifyEscalation({ threadId: resolution.threadId, userId: input.userId, userPhone: input.phone, reason: `User requested a human: ${input.text}` });
      return { duplicate: false, reply: "Got it — I’m flagging this for a real person. The matter will stay open while they respond." };
    }
    return { duplicate: false, reply: "I can flag an open matter for a person, but I need to know which matter you mean." };
  }

  const resolution = route.threadId ? { type: "existing" as const, threadId: route.threadId } : await resolveThread(input.userId, input.text);
  if (resolution.type === "ambiguous") {
    const lines = resolution.candidates.map((c, i) => `${i + 1}. ${c.summary}`).join("\n");
    return { duplicate: false, reply: `I have more than one open matter this could refer to. Which one do you mean?\n${lines}` };
  }

  if (resolution.type === "new" && process.env.REQUIRE_PAYMENT === "true") {
    const payment = await initiateSTKPush({ userId: input.userId, phone: input.phone, originalMessage: input.text, externalMessageId: input.externalId });
    return { duplicate: false, reply: payment.checkoutRequestId ? "Check your phone for the M-Pesa prompt. I’ll start the decision session after payment is confirmed." : "I couldn't send the payment prompt just now. Please try again in a moment." };
  }

  const threadId = resolution.type === "new" ? (await prisma.thread.create({ data: { userId: input.userId } })).id : resolution.threadId;
  if (input.externalId) {
    const duplicate = await prisma.message.findFirst({ where: { channel: input.channel, externalId: input.externalId } });
    if (duplicate) return { duplicate: true, reply: null as string | null };
  }
  await prisma.message.create({ data: { threadId, direction: "IN", content: input.text, externalId: input.externalId, channel: input.channel } });
  const result = await runShauriGraph({ threadId, userId: input.userId, rawInput: input.text, injectedContext: await buildInjectedContext(input.userId, input.text) });
  await prisma.message.create({ data: { threadId, direction: "OUT", content: result.reply, channel: input.channel } });
  return { duplicate: false, reply: result.reply };
}
