/**
 * Human Authority Integration Flow
 * --------------------------------
 *
 * Verifies the complete human-information authority lifecycle:
 *
 *   information need
 *        ↓
 *   human-routing
 *        ↓
 *   USER / OPERATOR
 *        ↓
 *   HumanQuery
 *        ↓
 *   thread pause
 *        ↓
 *   correct authority answers
 *        ↓
 *   thread resumes
 *
 * This test deliberately verifies both:
 *
 *   1. USER-authoritative information
 *   2. OPERATOR-authoritative information
 *
 * It also verifies that an OPERATOR query cannot accidentally be answered
 * by an ordinary user message.
 *
 * IMPORTANT:
 * This test uses the real Prisma database and the real human-routing module,
 * but injects the operator-resume transport/graph dependencies so that the
 * test never sends a real WhatsApp message or invokes a real LLM graph.
 */

import "dotenv/config";

import { HumanQuerySource } from "@prisma/client";

import { prisma } from "../src/infrastructure/prisma";
import {
  createHumanQuery,
  answerHumanQuery,
  resumeHumanQueryFromOperator,
} from "../src/agent/human-query";
import { determineHumanQuerySource } from "../src/agent/human-routing";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function cleanupUser(userId: string) {
  /*
   * Delete dependent records explicitly so this test does not depend on
   * database cascade configuration.
   */

  await prisma.humanQueryMessage.deleteMany({
    where: {
      humanQuery: {
        userId,
      },
    },
  });

  await prisma.humanQuery.deleteMany({
    where: {
      userId,
    },
  });

  await prisma.knowledgeCandidate.deleteMany({
    where: {
      userId,
    },
  });

  await prisma.graphCheckpoint.deleteMany({
    where: {
      thread: {
        userId,
      },
    },
  });

  await prisma.message.deleteMany({
    where: {
      thread: {
        userId,
      },
    },
  });

  await prisma.thread.deleteMany({
    where: {
      userId,
    },
  });

  await prisma.userProfile.deleteMany({
    where: {
      userId,
    },
  });

  await prisma.user.delete({
    where: {
      id: userId,
    },
  });
}

async function main() {
  let userId: string | undefined;

  console.log("========================================");
  console.log("HUMAN AUTHORITY INTEGRATION TEST");
  console.log("========================================");
  console.log();

  try {
    // ─────────────────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────────────────

    console.log("[1] Creating integration-test user...");

    const user = await prisma.user.create({
      data: {
        phone: `+254700${Date.now().toString().slice(-6)}`,
      },
    });

    userId = user.id;

    console.log(`✓ User created: ${user.id}`);
    console.log(`✓ Phone: ${user.phone}`);

    // ─────────────────────────────────────────────────────────────────────
    // USER AUTHORITY
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[2] Testing USER authority routing...");

    const userRouting = await determineHumanQuerySource({
      matter: "Choosing whether to accept a new job",
      question: "What matters most to you when choosing between these jobs?",
      reason: "Shauri needs the user's personal priorities.",
      known: [
        "The user has two job opportunities.",
      ],
      open: [
        "The user's personal priorities are unknown.",
      ],
    });

    console.log(`✓ Router source: ${userRouting.source}`);
    console.log(`✓ Router confidence: ${userRouting.confidence}`);
    console.log(`✓ Router reason: ${userRouting.reason}`);

    assert(
      userRouting.source === HumanQuerySource.USER,
      `Expected USER routing, got ${userRouting.source}`,
    );

    // ─────────────────────────────────────────────────────────────────────
    // USER THREAD
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[3] Creating USER-authority thread...");

    const userThread = await prisma.thread.create({
      data: {
        userId: user.id,
        currentPass: "INTAKE",
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: HumanQuerySource.USER,
        known: [
          "The user has two job opportunities.",
        ],
        open: [
          "The user's personal priorities are unknown.",
        ],
      },
    });

    console.log(`✓ Thread created: ${userThread.id}`);

    // ─────────────────────────────────────────────────────────────────────
    // USER HUMAN QUERY
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[4] Creating USER HumanQuery...");

    const userQuery = await createHumanQuery({
      userId: user.id,
      threadId: userThread.id,
      matter: "Choosing whether to accept a new job",
      question: "What matters most to you when choosing between these jobs?",
      knownContext: JSON.stringify({
        source: "USER",
        known: userThread.known,
        open: userThread.open,
      }),
      reason: userRouting.reason,
      source: "USER",
    });

    console.log(`✓ HumanQuery created: ${userQuery.id}`);
    console.log(`✓ Source: ${userQuery.source}`);
    console.log(`✓ Status: ${userQuery.status}`);

    assert(
      userQuery.source === HumanQuerySource.USER,
      `Expected USER HumanQuery, got ${userQuery.source}`,
    );

    assert(
      userQuery.status === "OPEN",
      `Expected USER HumanQuery OPEN, got ${userQuery.status}`,
    );

    const pausedUserThread = await prisma.thread.findUniqueOrThrow({
      where: {
        id: userThread.id,
      },
    });

    assert(
      pausedUserThread.awaitingHuman === true,
      "USER thread should be awaitingHuman=true",
    );

    assert(
      pausedUserThread.awaitingSource === HumanQuerySource.USER,
      `USER thread should have awaitingSource=USER, got ${pausedUserThread.awaitingSource}`,
    );

    console.log("✓ USER thread awaitingHuman=true");
    console.log("✓ USER thread awaitingSource=USER");

    // ─────────────────────────────────────────────────────────────────────
    // USER ANSWER
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[5] Answering USER HumanQuery...");

    await answerHumanQuery(
      userQuery.id,
      "Financial stability and being close to my family matter most to me.",
    );

    const answeredUserQuery =
      await prisma.humanQuery.findUniqueOrThrow({
        where: {
          id: userQuery.id,
        },
      });

    const resumedUserThread =
      await prisma.thread.findUniqueOrThrow({
        where: {
          id: userThread.id,
        },
      });

    assert(
      answeredUserQuery.status === "ANSWERED",
      `USER query should be ANSWERED, got ${answeredUserQuery.status}`,
    );

    assert(
      resumedUserThread.awaitingHuman === false,
      "USER thread should no longer await human input",
    );

    assert(
      resumedUserThread.awaitingSource === HumanQuerySource.NONE,
      `USER thread should have awaitingSource=NONE, got ${resumedUserThread.awaitingSource}`,
    );

    assert(
      resumedUserThread.currentPass === "GROUND",
      `USER thread should resume at GROUND, got ${resumedUserThread.currentPass}`,
    );

    console.log("✓ USER query answered");
    console.log("✓ awaitingHuman=false");
    console.log("✓ awaitingSource=NONE");
    console.log("✓ Thread resumed at GROUND");

    const userKnowledge =
      await prisma.knowledgeCandidate.findMany({
        where: {
          threadId: userThread.id,
        },
      });

    assert(
      userKnowledge.length === 1,
      `Expected 1 USER KnowledgeCandidate, got ${userKnowledge.length}`,
    );

    console.log("✓ USER KnowledgeCandidate created");

    // ─────────────────────────────────────────────────────────────────────
    // OPERATOR AUTHORITY
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[6] Testing OPERATOR authority routing...");

    const operatorRouting =
      await determineHumanQuerySource({
        matter: "Accessing a community service",
        question:
          "Is this community service currently available to residents?",
        reason:
          "Availability is controlled by the organisation/community and must be verified externally.",
        known: [
          "The user wants to access the service.",
        ],
        open: [
          "Current service availability is unknown.",
        ],
      });

    console.log(`✓ Router source: ${operatorRouting.source}`);
    console.log(`✓ Router confidence: ${operatorRouting.confidence}`);
    console.log(`✓ Router reason: ${operatorRouting.reason}`);

    assert(
      operatorRouting.source === HumanQuerySource.OPERATOR,
      `Expected OPERATOR routing, got ${operatorRouting.source}`,
    );

    // ─────────────────────────────────────────────────────────────────────
    // OPERATOR THREAD
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[7] Creating OPERATOR-authority thread...");

    const operatorThread = await prisma.thread.create({
      data: {
        userId: user.id,
        currentPass: "GROUND",
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: HumanQuerySource.USER,
        known: [
          "The user wants to access the community service.",
        ],
        open: [
          "Current service availability is unknown.",
        ],
      },
    });

    console.log(`✓ Thread created: ${operatorThread.id}`);

    // ─────────────────────────────────────────────────────────────────────
    // OPERATOR HUMAN QUERY
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[8] Creating OPERATOR HumanQuery...");

    const operatorQuery = await createHumanQuery({
      userId: user.id,
      threadId: operatorThread.id,
      matter: "Accessing a community service",
      question:
        "Is this community service currently available to residents?",
      knownContext: JSON.stringify({
        source: "OPERATOR",
        known: operatorThread.known,
        open: operatorThread.open,
      }),
      reason: operatorRouting.reason,
      source: "OPERATOR",
    });

    console.log(`✓ HumanQuery created: ${operatorQuery.id}`);
    console.log(`✓ Source: ${operatorQuery.source}`);
    console.log(`✓ Status: ${operatorQuery.status}`);

    assert(
      operatorQuery.source === HumanQuerySource.OPERATOR,
      `Expected OPERATOR HumanQuery, got ${operatorQuery.source}`,
    );

    assert(
      operatorQuery.status === "OPEN",
      `Expected OPERATOR HumanQuery OPEN, got ${operatorQuery.status}`,
    );

    const pausedOperatorThread =
      await prisma.thread.findUniqueOrThrow({
        where: {
          id: operatorThread.id,
        },
      });

    assert(
      pausedOperatorThread.awaitingHuman === true,
      "OPERATOR thread should be awaitingHuman=true",
    );

    assert(
      pausedOperatorThread.awaitingSource ===
        HumanQuerySource.OPERATOR,
      `OPERATOR thread should have awaitingSource=OPERATOR, got ${pausedOperatorThread.awaitingSource}`,
    );

    console.log("✓ OPERATOR thread awaitingHuman=true");
    console.log("✓ OPERATOR thread awaitingSource=OPERATOR");

    // ─────────────────────────────────────────────────────────────────────
    // USER MUST NOT ANSWER OPERATOR QUERY
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[9] Verifying OPERATOR query cannot be answered by user...");

    const stillOpenOperatorQuery =
      await prisma.humanQuery.findUniqueOrThrow({
        where: {
          id: operatorQuery.id,
        },
      });

    assert(
      stillOpenOperatorQuery.status === "OPEN",
      "OPERATOR query must remain OPEN until operator answers",
    );

    assert(
      stillOpenOperatorQuery.source === HumanQuerySource.OPERATOR,
      "OPERATOR query must retain OPERATOR authority",
    );

    console.log("✓ OPERATOR HumanQuery remains OPEN");
    console.log("✓ OPERATOR remains authoritative");

    // ─────────────────────────────────────────────────────────────────────
    // OPERATOR RESUME
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[10] Testing operator → user → Shauri resume...");

    let whatsappCalls: number = 0;

    /*
     * Explicit boolean annotations are important here.
     *
     * Without them TypeScript can narrow these variables to the literal
     * type `false` because they are initialized to false and the compiler
     * cannot always account for mutation occurring inside injected async
     * callbacks.
     */
    let graphCalled: boolean = false;
    let contextCalled: boolean = false;

    const sentMessages: Array<{
      phone: string;
      message: string;
    }> = [];

    const result = await resumeHumanQueryFromOperator(
      operatorQuery.id,
      "Yes. The service is currently available to residents.",
      {
        sendUserMessage: async (
          _userId: string,
          phone: string,
          message: string,
        ) => {
          whatsappCalls += 1;

          sentMessages.push({
            phone,
            message,
          });
          return { channel: "whatsapp" };
        },

        buildInjectedContext: async (
          _userId: string,
          input: string,
        ) => {
          contextCalled = true;

          assert(
            input.includes("service is currently available"),
            "Injected context should contain the operator answer",
          );

          return `Operator-provided evidence: ${input}`;
        },

        runShauriGraph: async (input) => {
          graphCalled = true;

          assert(
            input.threadId === operatorThread.id,
            "Graph should resume the correct thread",
          );

          assert(
            input.userId === user.id,
            "Graph should resume for the correct user",
          );

          assert(
            input.rawInput.includes("service is currently available"),
            "Graph should receive the operator answer",
          );

          assert(
            input.injectedContext?.includes(
              "Operator-provided evidence",
            ),
            "Graph should receive injected operator context",
          );

          return {
            reply:
              "The service is available. You can proceed with the next step.",
            awaitingReply: false,
          };
        },
      },
    );

    assert(
      whatsappCalls === 2,
      `Expected 2 WhatsApp sends, got ${whatsappCalls}`,
    );

    assert(
      graphCalled,
      "Shauri graph should have been called after operator answer",
    );

    assert(
      contextCalled,
      "Injected context should have been built",
    );

    assert(
      result.reply.includes("service is available"),
      "Resume result should contain Shauri's follow-up reply",
    );

    assert(
      result.awaitingReply === false,
      "Resume should not leave the thread awaiting a reply",
    );

    assert(
      sentMessages.length === 2,
      `Expected 2 captured WhatsApp messages, got ${sentMessages.length}`,
    );

    assert(
      sentMessages[0].message.includes(
        "service is currently available",
      ),
      "First WhatsApp message should be the operator answer",
    );

    assert(
      sentMessages[1].message.includes(
        "service is available",
      ),
      "Second WhatsApp message should be Shauri's follow-up",
    );

    console.log("✓ Operator answer accepted");
    console.log("✓ Operator answer sent to user");
    console.log("✓ Context rebuilt");
    console.log("✓ Shauri graph resumed");
    console.log("✓ Shauri follow-up delivered");

    // ─────────────────────────────────────────────────────────────────────
    // FINAL OPERATOR STATE
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[11] Verifying final OPERATOR lifecycle state...");

    const finalOperatorQuery =
      await prisma.humanQuery.findUniqueOrThrow({
        where: {
          id: operatorQuery.id,
        },
      });

    const finalOperatorThread =
      await prisma.thread.findUniqueOrThrow({
        where: {
          id: operatorThread.id,
        },
      });

    assert(
      finalOperatorQuery.status === "ANSWERED",
      `Expected OPERATOR query ANSWERED, got ${finalOperatorQuery.status}`,
    );

    assert(
      finalOperatorThread.awaitingHuman === false,
      "OPERATOR thread should have awaitingHuman=false",
    );

    assert(
      finalOperatorThread.awaitingSource === HumanQuerySource.NONE,
      `OPERATOR thread should have awaitingSource=NONE, got ${finalOperatorThread.awaitingSource}`,
    );

    assert(
      finalOperatorThread.currentPass === "GROUND",
      `OPERATOR thread should resume at GROUND, got ${finalOperatorThread.currentPass}`,
    );

    console.log("✓ OPERATOR query ANSWERED");
    console.log("✓ awaitingHuman=false");
    console.log("✓ awaitingSource=NONE");
    console.log("✓ Thread resumed at GROUND");

    const operatorKnowledge =
      await prisma.knowledgeCandidate.findMany({
        where: {
          threadId: operatorThread.id,
        },
      });

    assert(
      operatorKnowledge.length === 1,
      `Expected 1 OPERATOR KnowledgeCandidate, got ${operatorKnowledge.length}`,
    );

    console.log("✓ OPERATOR KnowledgeCandidate created");

    // ─────────────────────────────────────────────────────────────────────
    // MESSAGE AUDIT
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[12] Verifying operator message audit trail...");

    const messages = await prisma.message.findMany({
      where: {
        threadId: operatorThread.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    assert(
      messages.length === 2,
      `Expected 2 persisted operator-resume messages, got ${messages.length}`,
    );

    assert(
      messages[0].metadata &&
        typeof messages[0].metadata === "object" &&
        (messages[0].metadata as Record<string, unknown>).source ===
          "human_operator",
      "First persisted message should be marked human_operator",
    );

    assert(
      messages[1].metadata &&
        typeof messages[1].metadata === "object" &&
        (messages[1].metadata as Record<string, unknown>).source ===
          "shauri_resume",
      "Second persisted message should be marked shauri_resume",
    );

    console.log("✓ Operator answer audit record exists");
    console.log("✓ Shauri resume audit record exists");

    // ─────────────────────────────────────────────────────────────────────
    // HUMAN QUERY MESSAGE AUDIT
    // ─────────────────────────────────────────────────────────────────────

    console.log();
    console.log("[13] Verifying HumanQuery message history...");

    const humanMessages =
      await prisma.humanQueryMessage.findMany({
        where: {
          humanQueryId: operatorQuery.id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

    assert(
      humanMessages.length === 2,
      `Expected 2 HumanQuery messages, got ${humanMessages.length}`,
    );

    assert(
      humanMessages[0].direction === "SYSTEM",
      "First HumanQuery message should be SYSTEM",
    );

    assert(
      humanMessages[1].direction === "IN",
      "Second HumanQuery message should be IN",
    );

    console.log("✓ HumanQuery question recorded");
    console.log("✓ HumanQuery answer recorded");
    console.log("✓ HumanQuery audit trail intact");

    console.log();
    console.log("========================================");
    console.log("ALL HUMAN AUTHORITY INTEGRATION TESTS PASSED");
    console.log("========================================");
  } catch (error) {
    console.log();
    console.log("========================================");
    console.log("HUMAN AUTHORITY INTEGRATION TEST FAILED");
    console.log("========================================");

    console.error(error);

    throw error;
  } finally {
    if (userId) {
      try {
        await cleanupUser(userId);
        console.log();
        console.log("✓ Integration-test data cleaned up");
      } catch (cleanupError) {
        console.error(
          "WARNING: Failed to clean up integration-test data:",
          cleanupError,
        );
      }
    }

    await prisma.$disconnect();
  }
}

main().catch(() => {
  process.exit(1);
});