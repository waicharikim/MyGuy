import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import { prisma } from "../src/infrastructure/prisma";
import { PaController } from "../src/pa/pa.controller";
import { hashPaSecret } from "../src/pa/link";
import { ingestInboundMessage } from "../src/application/inbound-message.service";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`TEST FAILED: ${message}`);
}

class TestResponse {
  headers: string[] = [];
  body: Record<string, unknown> = {};
  statusCode = 200;

  append(name: string, value: string) {
    if (name.toLowerCase() === "set-cookie") this.headers.push(value);
    return this;
  }

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(body: Record<string, unknown>) {
    this.body = body;
    return this;
  }
}

function testRequest(input: {
  origin?: string;
  cookie?: string;
  ip?: string;
  params?: Record<string, string>;
} = {}): Request {
  return {
    headers: input.cookie ? { cookie: input.cookie } : {},
    ip: input.ip ?? "127.0.0.1",
    socket: { remoteAddress: input.ip ?? "127.0.0.1" },
    get: (name: string) => name.toLowerCase() === "origin" ? input.origin : undefined,
    body: {},
    params: input.params ?? {},
  } as unknown as Request;
}

function cookieFrom(response: TestResponse, name: string): string {
  const cookie = response.headers.find((header) => header.startsWith(`${name}=`));
  if (!cookie) throw new Error(`TEST FAILED: ${name} cookie was not set.`);
  return decodeURIComponent(cookie.split(";")[0].slice(name.length + 1));
}

async function main() {
  process.env.PA_SESSION_SECRET = "pa-link-test-secret-".padEnd(40, "x");
  const phone = `+2547${Date.now().toString().slice(-8)}`;
  let userId: string | undefined;
  let otherUserId: string | undefined;
  let linkCodeHash: string | undefined;
  let webSessionTokenHash: string | undefined;
  const receiptIds: string[] = [];
  const threadIds: string[] = [];

  try {
    const user = await prisma.user.create({ data: { phone } });
    userId = user.id;
    const controller = new PaController();
    const origin = "http://localhost:5173";
    const ip = `127.0.0.${(Date.now() % 200) + 20}`;
    const linkResponse = new TestResponse();
    await controller.createLink(
      testRequest({ origin, ip }),
      linkResponse as unknown as Response,
    );
    const challengeCode = String(linkResponse.body.code);
    linkCodeHash = hashPaSecret("link-code", challengeCode);
    assert(/^[A-HJ-NP-Z2-9]{10}$/.test(challengeCode), "Link API returns a high-entropy, unambiguous one-time code.");
    const browserCookie = cookieFrom(linkResponse, "pa_link");
    assert(browserCookie.length >= 40, "The browser receives an opaque high-entropy link cookie.");

    const linkReceiptId = randomUUID();
    receiptIds.push(linkReceiptId);
    const result = await ingestInboundMessage({
      phone,
      text: `/pa-link ${challengeCode.toLowerCase()}`,
      externalId: linkReceiptId,
      channel: "whatsapp",
    });
    assert(result.reply?.includes("Return to your browser"), "A valid WhatsApp pairing command is handled and confirmed.");
    const storedReceipt = await prisma.inboundReceipt.findUniqueOrThrow({
      where: {
        channel_externalId: {
          channel: "whatsapp",
          externalId: linkReceiptId,
        },
      },
    });
    assert(!storedReceipt.text.includes(challengeCode), "The one-time code is redacted from the inbound audit receipt.");

    const linked = await prisma.paLinkChallenge.findUniqueOrThrow({
      where: { codeHash: linkCodeHash },
    });
    assert(linked.userId === user.id && linked.completedAt !== null, "The challenge is bound to the verified WhatsApp user.");

    const statusResponse = new TestResponse();
    await controller.linkStatus(
      testRequest({ origin, cookie: `pa_link=${browserCookie}` }),
      statusResponse as unknown as Response,
    );
    assert(statusResponse.body.state === "linked", "The browser can exchange the completed link for a session.");
    const sessionCookie = cookieFrom(statusResponse, "pa_session");
    webSessionTokenHash = hashPaSecret("web-session", sessionCookie);

    const sessionStatus = await controller.session(
      testRequest({ origin, cookie: `pa_session=${sessionCookie}` }),
    );
    assert(sessionStatus.linked, "Only the linked browser session is authenticated.");

    const thread = await prisma.thread.create({ data: { userId: user.id } });
    threadIds.push(thread.id);
    const threadResponse = new TestResponse();
    await controller.threadMessages(
      testRequest({
        origin,
        cookie: `pa_session=${sessionCookie}`,
        params: { threadId: thread.id },
      }),
      threadResponse as unknown as Response,
    );
    assert(Array.isArray(threadResponse.body.messages), "The linked user can load their own transcript.");

    const otherUser = await prisma.user.create({
      data: { phone: `+2547${(Date.now() + 1).toString().slice(-8)}` },
    });
    otherUserId = otherUser.id;
    const otherThread = await prisma.thread.create({ data: { userId: otherUser.id } });
    threadIds.push(otherThread.id);
    let crossUserThreadRejected = false;
    try {
      await controller.threadMessages(
        testRequest({
          origin,
          cookie: `pa_session=${sessionCookie}`,
          params: { threadId: otherThread.id },
        }),
        new TestResponse() as unknown as Response,
      );
    } catch {
      crossUserThreadRejected = true;
    }
    assert(crossUserThreadRejected, "A PA session cannot read another user's decision transcript.");

    const replayReceiptId = randomUUID();
    receiptIds.push(replayReceiptId);
    const replay = await ingestInboundMessage({
      phone,
      text: `/pa-link ${challengeCode}`,
      externalId: replayReceiptId,
      channel: "whatsapp",
    });
    assert(replay.reply?.includes("invalid or expired"), "A completed one-time code cannot be replayed.");

    const malformedReceiptId = randomUUID();
    receiptIds.push(malformedReceiptId);
    const malformed = await ingestInboundMessage({
      phone,
      text: "/pa-link",
      externalId: malformedReceiptId,
      channel: "whatsapp",
    });
    assert(malformed.reply?.includes("one-time command"), "Malformed pairing commands are handled explicitly.");

    const logoutResponse = new TestResponse();
    await controller.logout(
      testRequest({ origin, cookie: `pa_session=${sessionCookie}` }),
      logoutResponse as unknown as Response,
    );
    const loggedOut = await controller.session(
      testRequest({ origin, cookie: `pa_session=${sessionCookie}` }),
    );
    assert(!loggedOut.linked, "Logout revokes the browser session.");
    const replayedLink = new TestResponse();
    await controller.linkStatus(
      testRequest({ origin, cookie: `pa_link=${browserCookie}` }),
      replayedLink as unknown as Response,
    );
    assert(replayedLink.body.state === "expired", "A stale link cookie cannot recreate a logged-out session.");

    let untrustedOriginRejected = false;
    try {
      await controller.createLink(
        testRequest({ origin: "https://attacker.example", ip }),
        new TestResponse() as unknown as Response,
      );
    } catch {
      untrustedOriginRejected = true;
    }
    assert(untrustedOriginRejected, "Link creation rejects an untrusted browser origin.");

    console.log("✓ PA linking uses one-time WhatsApp challenges and revocable browser sessions");
    console.log("PA LINK TEST PASSED");
  } finally {
    if (threadIds.length) {
      await prisma.thread.deleteMany({ where: { id: { in: threadIds } } });
    }
    if (receiptIds.length) {
      await prisma.inboundReceipt.deleteMany({
        where: {
          channel: "whatsapp",
          externalId: { in: receiptIds },
        },
      });
    }
    if (webSessionTokenHash) {
      await prisma.paWebSession.deleteMany({ where: { tokenHash: webSessionTokenHash } });
    }
    if (linkCodeHash) {
      await prisma.paLinkChallenge.deleteMany({ where: { codeHash: linkCodeHash } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (otherUserId) {
      await prisma.user.deleteMany({ where: { id: otherUserId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
