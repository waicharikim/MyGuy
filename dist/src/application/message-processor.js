"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMessage = processMessage;
const prisma_1 = require("../infrastructure/prisma");
const thread_resolver_1 = require("./thread-resolver");
const create_task_1 = require("../tools/create_task");
const create_note_1 = require("../tools/create_note");
const escalation_1 = require("../agent/escalation");
const graph_1 = require("../agent/graph");
const router_1 = require("../agent/router");
const context_1 = require("../agent/context");
const mpesa_1 = require("../tools/mpesa");
async function processMessage(input) {
    const route = await (0, router_1.routeMessage)(input.userId, input.text);
    if (route.intent === "task_create") {
        await (0, create_task_1.createTask)({ userId: input.userId, description: route.extracted || input.text });
        return { duplicate: false, reply: `Task saved: "${route.extracted || input.text}"` };
    }
    if (route.intent === "note_create") {
        await (0, create_note_1.createNote)({ userId: input.userId, content: route.extracted || input.text });
        return { duplicate: false, reply: "Noted." };
    }
    if (route.intent === "finance_query")
        return { duplicate: false, reply: "Financial account reads are not enabled yet. I can still help you reason through a financial decision." };
    if (route.intent === "escalation_request") {
        const resolution = await (0, thread_resolver_1.resolveThread)(input.userId, input.text);
        if (resolution.type === "existing") {
            await (0, escalation_1.notifyEscalation)({ threadId: resolution.threadId, userId: input.userId, userPhone: input.phone, reason: `User requested a human: ${input.text}` });
            return { duplicate: false, reply: "Got it — I’m flagging this for a real person. The matter will stay open while they respond." };
        }
        return { duplicate: false, reply: "I can flag an open matter for a person, but I need to know which matter you mean." };
    }
    const resolution = route.threadId ? { type: "existing", threadId: route.threadId } : await (0, thread_resolver_1.resolveThread)(input.userId, input.text);
    if (resolution.type === "ambiguous") {
        const lines = resolution.candidates.map((c, i) => `${i + 1}. ${c.summary}`).join("\n");
        return { duplicate: false, reply: `I have more than one open matter this could refer to. Which one do you mean?\n${lines}` };
    }
    if (resolution.type === "new" && process.env.REQUIRE_PAYMENT === "true") {
        const payment = await (0, mpesa_1.initiateSTKPush)({ userId: input.userId, phone: input.phone, originalMessage: input.text, externalMessageId: input.externalId });
        return { duplicate: false, reply: payment.checkoutRequestId ? "Check your phone for the M-Pesa prompt. I’ll start the decision session after payment is confirmed." : "I couldn't send the payment prompt just now. Please try again in a moment." };
    }
    const threadId = resolution.type === "new" ? (await prisma_1.prisma.thread.create({ data: { userId: input.userId } })).id : resolution.threadId;
    if (input.externalId) {
        const duplicate = await prisma_1.prisma.message.findFirst({ where: { channel: input.channel, externalId: input.externalId } });
        if (duplicate)
            return { duplicate: true, reply: null };
    }
    await prisma_1.prisma.message.create({ data: { threadId, direction: "IN", content: input.text, externalId: input.externalId, channel: input.channel } });
    const result = await (0, graph_1.runShauriGraph)({ threadId, userId: input.userId, rawInput: input.text, injectedContext: await (0, context_1.buildInjectedContext)(input.userId, input.text) });
    await prisma_1.prisma.message.create({ data: { threadId, direction: "OUT", content: result.reply, channel: input.channel } });
    return { duplicate: false, reply: result.reply };
}
