import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../infrastructure/prisma";
import { ingestInboundMessage } from "../application/inbound-message.service";
import {
  generatePaBrowserSecret,
  generatePaLinkCode,
  hashPaSecret,
} from "./link";

const LINK_COOKIE = "pa_link";
const SESSION_COOKIE = "pa_session";
const LINK_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHAT_LIMIT_PER_MINUTE = 30;
const LINK_LIMIT_PER_TEN_MINUTES = 3;

function allowedOrigins(): Set<string> {
  const configured = process.env.PA_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured?.length) return new Set(configured);
  if (process.env.NODE_ENV === "production") return new Set();
  return new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
}

function assertTrustedOrigin(request: Request, required: boolean): void {
  const origin = request.get("origin");
  if (!origin) {
    if (required) throw new ForbiddenException("A browser origin is required.");
    return;
  }
  if (!allowedOrigins().has(origin)) {
    throw new ForbiddenException("This PA origin is not allowed.");
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    const value = entry.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : undefined;
  }
  return undefined;
}

function setCookie(
  response: Response,
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/api/pa",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  response.append("Set-Cookie", attributes.join("; "));
}

function clearCookie(response: Response, name: string): void {
  setCookie(response, name, "", 0);
}

function sessionHash(token: string): string {
  return hashPaSecret("web-session", token);
}

async function authenticatedSession(request: Request, touch = true) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) throw new UnauthorizedException("Link PA to your WhatsApp account to continue.");

  const session = await prisma.paWebSession.findUnique({
    where: { tokenHash: sessionHash(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  ) {
    throw new UnauthorizedException("Your PA session has expired. Link your account again.");
  }
  if (touch && Date.now() - session.lastUsedAt.getTime() > 60_000) {
    await prisma.paWebSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
  }
  return session;
}

@Controller("api/pa")
export class PaController {
  @Post("link")
  async createLink(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    assertTrustedOrigin(request, true);

    const ip = request.ip || request.socket.remoteAddress || "unknown";
    const ipHash = hashPaSecret("link-ip", ip);
    const recentRequests = await prisma.paLinkChallenge.count({
      where: {
        ipHash,
        createdAt: { gte: new Date(Date.now() - LINK_TTL_MS) },
      },
    });
    if (recentRequests >= LINK_LIMIT_PER_TEN_MINUTES) {
      throw new HttpException(
        "Too many link attempts. Wait a few minutes and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = generatePaLinkCode();
    const browserSecret = generatePaBrowserSecret();
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    await prisma.paLinkChallenge.create({
      data: {
        codeHash: hashPaSecret("link-code", code),
        browserSecretHash: hashPaSecret("link-browser", browserSecret),
        ipHash,
        expiresAt,
      },
    });

    setCookie(response, LINK_COOKIE, browserSecret, LINK_TTL_MS / 1000);
    return response.status(201).json({
      code,
      command: `/pa-link ${code}`,
      expiresAt: expiresAt.toISOString(),
    });
  }

  @Get("link/status")
  async linkStatus(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    assertTrustedOrigin(request, false);
    const browserSecret = cookieValue(request, LINK_COOKIE);
    if (!browserSecret) {
      return response.json({ state: "not_started" });
    }

    const challenge = await prisma.paLinkChallenge.findUnique({
      where: {
        browserSecretHash: hashPaSecret("link-browser", browserSecret),
      },
    });
    if (!challenge || challenge.expiresAt <= new Date()) {
      clearCookie(response, LINK_COOKIE);
      return response.json({ state: "expired" });
    }
    if (!challenge.completedAt || !challenge.userId) {
      return response.json({ state: "pending" });
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await prisma.paWebSession.upsert({
      where: { tokenHash: sessionHash(browserSecret) },
      update: {
        lastUsedAt: new Date(),
        expiresAt,
      },
      create: {
        userId: challenge.userId,
        tokenHash: sessionHash(browserSecret),
        expiresAt,
      },
    });
    if (session.userId !== challenge.userId) {
      throw new ConflictException("The link session is already associated with another account.");
    }
    if (session.revokedAt || session.expiresAt <= new Date()) {
      clearCookie(response, LINK_COOKIE);
      return response.json({ state: "expired" });
    }

    setCookie(response, SESSION_COOKIE, browserSecret, SESSION_TTL_MS / 1000);
    clearCookie(response, LINK_COOKIE);
    return response.json({ state: "linked" });
  }

  @Get("session")
  async session(@Req() request: Request) {
    assertTrustedOrigin(request, false);
    try {
      await authenticatedSession(request);
      return { linked: true };
    } catch (error) {
      if (error instanceof UnauthorizedException) return { linked: false };
      throw error;
    }
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    assertTrustedOrigin(request, true);
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) {
      await prisma.paWebSession.updateMany({
        where: {
          tokenHash: sessionHash(token),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    clearCookie(response, SESSION_COOKIE);
    clearCookie(response, LINK_COOKIE);
    return response.status(200).json({ linked: false });
  }

  @Post("chat")
  async chat(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    assertTrustedOrigin(request, true);
    const session = await authenticatedSession(request);
    const body = request.body as { message?: unknown } | undefined;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) {
      throw new BadRequestException("Message must contain between 1 and 4,000 characters.");
    }

    const recentMessages = await prisma.inboundReceipt.count({
      where: {
        channel: "pa",
        phone: session.user.phone,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentMessages >= CHAT_LIMIT_PER_MINUTE) {
      throw new HttpException(
        "Please wait a moment before sending another message.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const result = await ingestInboundMessage({
      phone: session.user.phone,
      text: message,
      externalId: `${session.id}:${randomUUID()}`,
      channel: "pa",
    });
    if (!result.reply) {
      throw new ConflictException("Shauri did not produce a reply for this message. Please try again.");
    }
    return response.json({
      reply: result.reply,
      threadId: result.threadId,
    });
  }

  @Get("threads/:threadId/messages")
  async threadMessages(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    assertTrustedOrigin(request, false);
    const session = await authenticatedSession(request);
    const threadId = request.params.threadId;
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, userId: session.userId },
      select: { id: true },
    });
    if (!thread) {
      throw new ForbiddenException("This decision thread is not available to the linked account.");
    }

    const messages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        direction: true,
        content: true,
        createdAt: true,
      },
    });
    return response.json({
      messages: messages.reverse().map((message) => ({
        id: message.id,
        type: message.direction === "IN" ? "user" : "ai",
        message: message.content,
        timestamp: message.createdAt.toISOString(),
      })),
    });
  }
}
