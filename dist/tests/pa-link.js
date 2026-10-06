"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_crypto_1 = require("node:crypto");
const prisma_1 = require("../src/infrastructure/prisma");
const pa_controller_1 = require("../src/pa/pa.controller");
const link_1 = require("../src/pa/link");
const inbound_message_service_1 = require("../src/application/inbound-message.service");
function assert(condition, message) {
    if (!condition)
        throw new Error(`TEST FAILED: ${message}`);
}
class TestResponse {
    headers = [];
    body = {};
    statusCode = 200;
    append(name, value) {
        if (name.toLowerCase() === "set-cookie")
            this.headers.push(value);
        return this;
    }
    status(code) {
        this.statusCode = code;
        return this;
    }
    json(body) {
        this.body = body;
        return this;
    }
}
function testRequest(input = {}) {
    return {
        headers: input.cookie ? { cookie: input.cookie } : {},
        ip: input.ip ?? "127.0.0.1",
        socket: { remoteAddress: input.ip ?? "127.0.0.1" },
        get: (name) => name.toLowerCase() === "origin" ? input.origin : undefined,
        body: {},
        params: input.params ?? {},
    };
}
function cookieFrom(response, name) {
    const cookie = response.headers.find((header) => header.startsWith(`${name}=`));
    if (!cookie)
        throw new Error(`TEST FAILED: ${name} cookie was not set.`);
    return decodeURIComponent(cookie.split(";")[0].slice(name.length + 1));
}
async function main() {
    process.env.PA_SESSION_SECRET = "pa-link-test-secret-".padEnd(40, "x");
    const phone = `+2547${Date.now().toString().slice(-8)}`;
    let userId;
    let otherUserId;
    let linkCodeHash;
    let webSessionTokenHash;
    const receiptIds = [];
    const threadIds = [];
    try {
        const user = await prisma_1.prisma.user.create({ data: { phone } });
        userId = user.id;
        const controller = new pa_controller_1.PaController();
        const origin = "http://localhost:5173";
        const ip = `127.0.0.${(Date.now() % 200) + 20}`;
        const linkResponse = new TestResponse();
        await controller.createLink(testRequest({ origin, ip }), linkResponse);
        const challengeCode = String(linkResponse.body.code);
        linkCodeHash = (0, link_1.hashPaSecret)("link-code", challengeCode);
        assert(/^[A-HJ-NP-Z2-9]{10}$/.test(challengeCode), "Link API returns a high-entropy, unambiguous one-time code.");
        const browserCookie = cookieFrom(linkResponse, "pa_link");
        assert(browserCookie.length >= 40, "The browser receives an opaque high-entropy link cookie.");
        const linkReceiptId = (0, node_crypto_1.randomUUID)();
        receiptIds.push(linkReceiptId);
        const result = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone,
            text: `/pa-link ${challengeCode.toLowerCase()}`,
            externalId: linkReceiptId,
            channel: "whatsapp",
        });
        assert(result.reply?.includes("Return to your browser"), "A valid WhatsApp pairing command is handled and confirmed.");
        const storedReceipt = await prisma_1.prisma.inboundReceipt.findUniqueOrThrow({
            where: {
                channel_externalId: {
                    channel: "whatsapp",
                    externalId: linkReceiptId,
                },
            },
        });
        assert(!storedReceipt.text.includes(challengeCode), "The one-time code is redacted from the inbound audit receipt.");
        const linked = await prisma_1.prisma.paLinkChallenge.findUniqueOrThrow({
            where: { codeHash: linkCodeHash },
        });
        assert(linked.userId === user.id && linked.completedAt !== null, "The challenge is bound to the verified WhatsApp user.");
        const statusResponse = new TestResponse();
        await controller.linkStatus(testRequest({ origin, cookie: `pa_link=${browserCookie}` }), statusResponse);
        assert(statusResponse.body.state === "linked", "The browser can exchange the completed link for a session.");
        const sessionCookie = cookieFrom(statusResponse, "pa_session");
        webSessionTokenHash = (0, link_1.hashPaSecret)("web-session", sessionCookie);
        const sessionStatus = await controller.session(testRequest({ origin, cookie: `pa_session=${sessionCookie}` }));
        assert(sessionStatus.linked, "Only the linked browser session is authenticated.");
        const thread = await prisma_1.prisma.thread.create({ data: { userId: user.id } });
        threadIds.push(thread.id);
        const threadResponse = new TestResponse();
        await controller.threadMessages(testRequest({
            origin,
            cookie: `pa_session=${sessionCookie}`,
            params: { threadId: thread.id },
        }), threadResponse);
        assert(Array.isArray(threadResponse.body.messages), "The linked user can load their own transcript.");
        const otherUser = await prisma_1.prisma.user.create({
            data: { phone: `+2547${(Date.now() + 1).toString().slice(-8)}` },
        });
        otherUserId = otherUser.id;
        const otherThread = await prisma_1.prisma.thread.create({ data: { userId: otherUser.id } });
        threadIds.push(otherThread.id);
        let crossUserThreadRejected = false;
        try {
            await controller.threadMessages(testRequest({
                origin,
                cookie: `pa_session=${sessionCookie}`,
                params: { threadId: otherThread.id },
            }), new TestResponse());
        }
        catch {
            crossUserThreadRejected = true;
        }
        assert(crossUserThreadRejected, "A PA session cannot read another user's decision transcript.");
        const replayReceiptId = (0, node_crypto_1.randomUUID)();
        receiptIds.push(replayReceiptId);
        const replay = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone,
            text: `/pa-link ${challengeCode}`,
            externalId: replayReceiptId,
            channel: "whatsapp",
        });
        assert(replay.reply?.includes("invalid or expired"), "A completed one-time code cannot be replayed.");
        const malformedReceiptId = (0, node_crypto_1.randomUUID)();
        receiptIds.push(malformedReceiptId);
        const malformed = await (0, inbound_message_service_1.ingestInboundMessage)({
            phone,
            text: "/pa-link",
            externalId: malformedReceiptId,
            channel: "whatsapp",
        });
        assert(malformed.reply?.includes("one-time command"), "Malformed pairing commands are handled explicitly.");
        const logoutResponse = new TestResponse();
        await controller.logout(testRequest({ origin, cookie: `pa_session=${sessionCookie}` }), logoutResponse);
        const loggedOut = await controller.session(testRequest({ origin, cookie: `pa_session=${sessionCookie}` }));
        assert(!loggedOut.linked, "Logout revokes the browser session.");
        const replayedLink = new TestResponse();
        await controller.linkStatus(testRequest({ origin, cookie: `pa_link=${browserCookie}` }), replayedLink);
        assert(replayedLink.body.state === "expired", "A stale link cookie cannot recreate a logged-out session.");
        let untrustedOriginRejected = false;
        try {
            await controller.createLink(testRequest({ origin: "https://attacker.example", ip }), new TestResponse());
        }
        catch {
            untrustedOriginRejected = true;
        }
        assert(untrustedOriginRejected, "Link creation rejects an untrusted browser origin.");
        console.log("✓ PA linking uses one-time WhatsApp challenges and revocable browser sessions");
        console.log("PA LINK TEST PASSED");
    }
    finally {
        if (threadIds.length) {
            await prisma_1.prisma.thread.deleteMany({ where: { id: { in: threadIds } } });
        }
        if (receiptIds.length) {
            await prisma_1.prisma.inboundReceipt.deleteMany({
                where: {
                    channel: "whatsapp",
                    externalId: { in: receiptIds },
                },
            });
        }
        if (webSessionTokenHash) {
            await prisma_1.prisma.paWebSession.deleteMany({ where: { tokenHash: webSessionTokenHash } });
        }
        if (linkCodeHash) {
            await prisma_1.prisma.paLinkChallenge.deleteMany({ where: { codeHash: linkCodeHash } });
        }
        if (userId) {
            await prisma_1.prisma.user.deleteMany({ where: { id: userId } });
        }
        if (otherUserId) {
            await prisma_1.prisma.user.deleteMany({ where: { id: otherUserId } });
        }
        await prisma_1.prisma.$disconnect();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
