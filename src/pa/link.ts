import { createHmac, randomBytes } from "node:crypto";
import { prisma } from "../infrastructure/prisma";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const LINK_COMMAND = /^\/pa-link(?:@\w+)?(?:\s+(\S+))?$/i;

export function hashPaSecret(purpose: string, value: string): string {
  const secret = process.env.PA_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("PA_SESSION_SECRET must be configured with at least 32 characters");
  }
  return createHmac("sha256", secret)
    .update(`${purpose}:${value}`)
    .digest("hex");
}

export function generatePaLinkCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte & 31]).join("");
}

export function generatePaBrowserSecret(): string {
  return randomBytes(32).toString("base64url");
}

export async function consumePaLinkMessage(input: {
  userId: string;
  text: string;
}): Promise<{ handled: false } | { handled: true; reply: string }> {
  const match = input.text.trim().match(LINK_COMMAND);
  if (!match) {
    if (/^\/pa-link(?:@\w+)?(?:\s|$)/i.test(input.text.trim())) {
      return {
        handled: true,
        reply: "To link PA, use the one-time command shown in your PA browser. Codes expire after 10 minutes.",
      };
    }
    return { handled: false };
  }

  if (!match[1]) {
    return {
      handled: true,
      reply: "To link PA, use the one-time command shown in your PA browser. Codes expire after 10 minutes.",
    };
  }

  const code = match[1]?.toUpperCase();
  if (!code || !new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code)) {
    return {
      handled: true,
      reply: "That PA linking code is invalid or expired. Request a fresh code in PA and send its exact command here.",
    };
  }

  const now = new Date();
  const challenge = await prisma.paLinkChallenge.findUnique({
    where: { codeHash: hashPaSecret("link-code", code) },
    select: { id: true, expiresAt: true, completedAt: true },
  });
  if (!challenge || challenge.expiresAt <= now || challenge.completedAt) {
    return {
      handled: true,
      reply: "That PA linking code is invalid or expired. Request a fresh code in PA and send its exact command here.",
    };
  }

  const claimed = await prisma.paLinkChallenge.updateMany({
    where: {
      id: challenge.id,
      completedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      userId: input.userId,
      completedAt: now,
    },
  });

  if (claimed.count !== 1) {
    return {
      handled: true,
      reply: "That PA linking code is invalid or expired. Request a fresh code in PA and send its exact command here.",
    };
  }

  return {
    handled: true,
    reply: "PA is now linked to this WhatsApp account. Return to your browser to finish signing in.",
  };
}
