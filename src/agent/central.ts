/**
 * Compatibility facade.
 *
 * New inbound traffic enters through
 * application/inbound-message.service.ts.
 *
 * Keeping this function makes older entry points safe while
 * removing routing/orchestration responsibility from this module.
 */

import {
  ingestInboundMessage,
} from "../application/inbound-message.service";

export async function handleMessage(
  phone: string,
  text: string,
  externalId = `manual:${Date.now()}`,
) {
  const result =
    await ingestInboundMessage({
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

export {
  buildInjectedContext,
} from "./context";