"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaController = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_1 = require("../infrastructure/prisma");
const inbound_message_service_1 = require("../application/inbound-message.service");
const link_1 = require("./link");
const LINK_COOKIE = "pa_link";
const SESSION_COOKIE = "pa_session";
const LINK_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHAT_LIMIT_PER_MINUTE = 30;
const LINK_LIMIT_PER_TEN_MINUTES = 3;
function allowedOrigins() {
    const configured = process.env.PA_ALLOWED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    if (configured?.length)
        return new Set(configured);
    if (process.env.NODE_ENV === "production")
        return new Set();
    return new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
}
function assertTrustedOrigin(request, required) {
    const origin = request.get("origin");
    if (!origin) {
        if (required)
            throw new common_1.ForbiddenException("A browser origin is required.");
        return;
    }
    if (!allowedOrigins().has(origin)) {
        throw new common_1.ForbiddenException("This PA origin is not allowed.");
    }
}
function cookieValue(request, name) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader)
        return undefined;
    for (const entry of cookieHeader.split(";")) {
        const separator = entry.indexOf("=");
        if (separator < 0 || entry.slice(0, separator).trim() !== name)
            continue;
        const value = entry.slice(separator + 1).trim();
        return /^[A-Za-z0-9_-]+$/.test(value) ? value : undefined;
    }
    return undefined;
}
function setCookie(response, name, value, maxAgeSeconds) {
    const attributes = [
        `${name}=${encodeURIComponent(value)}`,
        "Path=/api/pa",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (process.env.NODE_ENV === "production")
        attributes.push("Secure");
    response.append("Set-Cookie", attributes.join("; "));
}
function clearCookie(response, name) {
    setCookie(response, name, "", 0);
}
function sessionHash(token) {
    return (0, link_1.hashPaSecret)("web-session", token);
}
async function authenticatedSession(request, touch = true) {
    const token = cookieValue(request, SESSION_COOKIE);
    if (!token)
        throw new common_1.UnauthorizedException("Link PA to your WhatsApp account to continue.");
    const session = await prisma_1.prisma.paWebSession.findUnique({
        where: { tokenHash: sessionHash(token) },
        include: { user: true },
    });
    if (!session ||
        session.revokedAt ||
        session.expiresAt <= new Date()) {
        throw new common_1.UnauthorizedException("Your PA session has expired. Link your account again.");
    }
    if (touch && Date.now() - session.lastUsedAt.getTime() > 60_000) {
        await prisma_1.prisma.paWebSession.update({
            where: { id: session.id },
            data: { lastUsedAt: new Date() },
        });
    }
    return session;
}
let PaController = class PaController {
    async createLink(request, response) {
        assertTrustedOrigin(request, true);
        const ip = request.ip || request.socket.remoteAddress || "unknown";
        const ipHash = (0, link_1.hashPaSecret)("link-ip", ip);
        const recentRequests = await prisma_1.prisma.paLinkChallenge.count({
            where: {
                ipHash,
                createdAt: { gte: new Date(Date.now() - LINK_TTL_MS) },
            },
        });
        if (recentRequests >= LINK_LIMIT_PER_TEN_MINUTES) {
            throw new common_1.HttpException("Too many link attempts. Wait a few minutes and try again.", common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const code = (0, link_1.generatePaLinkCode)();
        const browserSecret = (0, link_1.generatePaBrowserSecret)();
        const expiresAt = new Date(Date.now() + LINK_TTL_MS);
        await prisma_1.prisma.paLinkChallenge.create({
            data: {
                codeHash: (0, link_1.hashPaSecret)("link-code", code),
                browserSecretHash: (0, link_1.hashPaSecret)("link-browser", browserSecret),
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
    async linkStatus(request, response) {
        assertTrustedOrigin(request, false);
        const browserSecret = cookieValue(request, LINK_COOKIE);
        if (!browserSecret) {
            return response.json({ state: "not_started" });
        }
        const challenge = await prisma_1.prisma.paLinkChallenge.findUnique({
            where: {
                browserSecretHash: (0, link_1.hashPaSecret)("link-browser", browserSecret),
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
        const session = await prisma_1.prisma.paWebSession.upsert({
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
            throw new common_1.ConflictException("The link session is already associated with another account.");
        }
        if (session.revokedAt || session.expiresAt <= new Date()) {
            clearCookie(response, LINK_COOKIE);
            return response.json({ state: "expired" });
        }
        setCookie(response, SESSION_COOKIE, browserSecret, SESSION_TTL_MS / 1000);
        clearCookie(response, LINK_COOKIE);
        return response.json({ state: "linked" });
    }
    async session(request) {
        assertTrustedOrigin(request, false);
        try {
            await authenticatedSession(request);
            return { linked: true };
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException)
                return { linked: false };
            throw error;
        }
    }
    async logout(request, response) {
        assertTrustedOrigin(request, true);
        const token = cookieValue(request, SESSION_COOKIE);
        if (token) {
            await prisma_1.prisma.paWebSession.updateMany({
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
    async chat(request, response) {
        assertTrustedOrigin(request, true);
        const session = await authenticatedSession(request);
        const body = request.body;
        const message = typeof body?.message === "string" ? body.message.trim() : "";
        if (!message || message.length > 4000) {
            throw new common_1.BadRequestException("Message must contain between 1 and 4,000 characters.");
        }
        const recentMessages = await prisma_1.prisma.inboundReceipt.count({
            where: {
                channel: "pa",
                phone: session.user.phone,
                createdAt: { gte: new Date(Date.now() - 60_000) },
            },
        });
        if (recentMessages >= CHAT_LIMIT_PER_MINUTE) {
            throw new common_1.HttpException("Please wait a moment before sending another message.", common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const result = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone: session.user.phone,
            text: message,
            externalId: `${session.id}:${(0, node_crypto_1.randomUUID)()}`,
            channel: "pa",
        });
        if (!result.reply) {
            throw new common_1.ConflictException("Shauri did not produce a reply for this message. Please try again.");
        }
        return response.json({
            reply: result.reply,
            threadId: result.threadId,
        });
    }
    async threadMessages(request, response) {
        assertTrustedOrigin(request, false);
        const session = await authenticatedSession(request);
        const threadId = request.params.threadId;
        const thread = await prisma_1.prisma.thread.findFirst({
            where: { id: threadId, userId: session.userId },
            select: { id: true },
        });
        if (!thread) {
            throw new common_1.ForbiddenException("This decision thread is not available to the linked account.");
        }
        const messages = await prisma_1.prisma.message.findMany({
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
};
exports.PaController = PaController;
__decorate([
    (0, common_1.Post)("link"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaController.prototype, "createLink", null);
__decorate([
    (0, common_1.Get)("link/status"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaController.prototype, "linkStatus", null);
__decorate([
    (0, common_1.Get)("session"),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaController.prototype, "session", null);
__decorate([
    (0, common_1.Post)("logout"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)("chat"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaController.prototype, "chat", null);
__decorate([
    (0, common_1.Get)("threads/:threadId/messages"),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PaController.prototype, "threadMessages", null);
exports.PaController = PaController = __decorate([
    (0, common_1.Controller)("api/pa")
], PaController);
