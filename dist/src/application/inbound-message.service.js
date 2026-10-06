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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestInboundMessage = ingestInboundMessage;
const prisma_1 = require("../infrastructure/prisma");
const link_1 = require("../pa/link");
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
            const receiptText = channel === "whatsapp" &&
                /^\/pa-link(?:@\w+)?(?:\s|$)/i.test(input.text.trim())
                ? "/pa-link [one-time code redacted]"
                : input.text;
            await prisma_1.prisma.inboundReceipt.create({
                data: {
                    channel,
                    externalId: input.externalId,
                    phone: input.phone,
                    text: receiptText,
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
    if (channel === "whatsapp") {
        await prisma_1.prisma.channelIdentity.upsert({
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
        const linkResult = await (0, link_1.consumePaLinkMessage)({
            userId: user.id,
            text: input.text,
        });
        if (linkResult.handled) {
            await prisma_1.prisma.inboundReceipt.update({
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
        const { processMessage } = await Promise.resolve().then(() => __importStar(require("./message-processor")));
        const result = await processMessage({
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
