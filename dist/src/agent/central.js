"use strict";
/**
 * Compatibility facade.
 *
 * New inbound traffic enters through
 * application/inbound-message.service.ts.
 *
 * Keeping this function makes older entry points safe while
 * removing routing/orchestration responsibility from this module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInjectedContext = void 0;
exports.handleMessage = handleMessage;
const inbound_message_service_1 = require("../application/inbound-message.service");
async function handleMessage(phone, text, externalId = `manual:${Date.now()}`) {
    const result = await (0, inbound_message_service_1.ingestInboundMessage)({
        phone,
        text,
        externalId,
        channel: "whatsapp",
    });
    return {
        reply: result.reply ?? "",
        threadId: result.threadId ?? null,
    };
}
var context_1 = require("./context");
Object.defineProperty(exports, "buildInjectedContext", { enumerable: true, get: function () { return context_1.buildInjectedContext; } });
