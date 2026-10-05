"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestInboundMessage = ingestInboundMessage;
const prisma_1 = require("../infrastructure/prisma");
const message_processor_1 = require("./message-processor");
async function ingestInboundMessage(input) {
    const channel = input.channel ?? "whatsapp";
    /*
     * ---------------------------------------------------------------
     * 1. Check whether this external message was already processed.
     * ---------------------------------------------------------------
     */
    const existing = await prisma_1.prisma.inboundReceipt.findUnique({
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
            await prisma_1.prisma.inboundReceipt.create({
                data: {
                    channel,
                    externalId: input.externalId,
                    phone: input.phone,
                    text: input.text,
                },
            });
        }
        catch {
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
    const user = await prisma_1.prisma.user.upsert({
        where: {
            phone: input.phone,
        },
        update: {},
        create: {
            phone: input.phone,
        },
    });
    /*
     * ---------------------------------------------------------------
     * 4. Application processing.
     * ---------------------------------------------------------------
     */
    try {
        const result = await (0, message_processor_1.processMessage)({
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
        await prisma_1.prisma.inboundReceipt.update({
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
            duplicate: result.duplicate ?? false,
            reply: result.reply ?? null,
            threadId: result.threadId ?? null,
        };
    }
    catch (error) {
        console.error("Inbound message processing failed", error);
        /*
         * Leave processedAt unset.
         *
         * This means a failed message remains recoverable rather than
         * permanently becoming a successful receipt.
         */
        throw error;
    }
}
