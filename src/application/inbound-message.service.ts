/**
 * Inbound message boundary.
 *
 * Responsibilities:
 *
 * - Establish inbound-message idempotency.
 * - Create/find the user.
 * - Pass the message into application orchestration.
 *
 * This layer does NOT:
 *
 * - resolve threads
 * - classify intents
 * - run Shauri
 * - answer HumanQueries
 */

import { prisma } from "../infrastructure/prisma";
import { consumePaLinkMessage } from "../pa/link";

type InboundMessageResult = {
  duplicate: boolean;
  reply: string | null;
  threadId: string | null;
};

export async function ingestInboundMessage(
  input: {
    phone: string;
    text: string;
    externalId: string;
    channel?: string;
  },
): Promise<InboundMessageResult> {
  const channel =
    input.channel ?? "whatsapp";

  /*
   * ---------------------------------------------------------------
   * 1. Check whether this external message was already processed.
   * ---------------------------------------------------------------
   */

  const existing =
    await prisma.inboundReceipt.findUnique({
      where: {
        channel_externalId: {
          channel,
          externalId: input.externalId,
        },
      },
    });

  if (existing?.processedAt) {
    /*
     * The receipt already completed successfully.
     *
     * We deliberately do not attempt to reconstruct the previous
     * reply here. The caller only needs to know that this message
     * was already processed.
     */
    return {
      duplicate: true,
      reply: null,
      threadId: null,
    };
  }

  /*
   * ---------------------------------------------------------------
   * 2. Claim the inbound message.
   * ---------------------------------------------------------------
   *
   * The unique constraint prevents concurrent requests from
   * creating the same receipt.
   */

  if (!existing) {
    try {
      const receiptText =
        channel === "whatsapp" &&
        /^\/pa-link(?:@\w+)?(?:\s|$)/i.test(input.text.trim())
          ? "/pa-link [one-time code redacted]"
          : input.text;
      await prisma.inboundReceipt.create({
        data: {
          channel,
          externalId: input.externalId,
          phone: input.phone,
          text: receiptText,
        },
      });
    } catch {
      /*
       * Another request won the race.
       *
       * Treat this request as a duplicate.
       */
      return {
        duplicate: true,
        reply: null,
        threadId: null,
      };
    }
  }

  /*
   * ---------------------------------------------------------------
   * 3. Find/create user.
   * ---------------------------------------------------------------
   */

  const user =
    await prisma.user.upsert({
      where: {
        phone: input.phone,
      },

      update: {},

      create: {
        phone: input.phone,
      },
    });

  if (channel === "whatsapp") {
    await prisma.channelIdentity.upsert({
      where: {
        channel_externalId: {
          channel,
          externalId: input.phone,
        },
      },
      update: { userId: user.id, lastUsedAt: new Date() },
      create: {
        userId: user.id,
        channel,
        externalId: input.phone,
      },
    });
  }

  if (channel === "whatsapp") {
    const linkResult = await consumePaLinkMessage({
      userId: user.id,
      text: input.text,
    });
    if (linkResult.handled) {
      await prisma.inboundReceipt.update({
        where: {
          channel_externalId: {
            channel,
            externalId: input.externalId,
          },
        },
        data: { processedAt: new Date() },
      });
      return {
        duplicate: false,
        reply: linkResult.reply,
        threadId: null,
      };
    }
  }

  /*
   * ---------------------------------------------------------------
   * 4. Application processing.
   * ---------------------------------------------------------------
   */

  try {
    const { processMessage } = await import("./message-processor");
    const result =
      await processMessage({
        userId: user.id,
        phone: input.phone,
        text: input.text,
        externalId: input.externalId,
        channel,
      });

    /*
     * -------------------------------------------------------------
     * 5. Mark receipt processed only after successful processing.
     * -------------------------------------------------------------
     */

    await prisma.inboundReceipt.update({
      where: {
        channel_externalId: {
          channel,
          externalId: input.externalId,
        },
      },

      data: {
        processedAt: new Date(),
      },
    });

    /*
     * -------------------------------------------------------------
     * 6. Return the complete application result.
     * -------------------------------------------------------------
     */

    return {
      duplicate:
        result.duplicate ?? false,

      reply:
        result.reply ?? null,

      threadId:
        result.threadId ?? null,
    };
  } catch (error) {
    console.error(
      "Inbound message processing failed",
      error,
    );

    /*
     * Leave processedAt unset.
     *
     * This means a failed message remains recoverable rather than
     * permanently becoming a successful receipt.
     */
    throw error;
  }
}