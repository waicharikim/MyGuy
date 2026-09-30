/**
 * Operator Human Query Resume Test
 * --------------------------------
 *
 * Verifies the complete operator-owned HumanQuery lifecycle:
 *
 *   1. Create user.
 *   2. Create thread.
 *   3. Create OPERATOR HumanQuery.
 *   4. Verify thread pauses for OPERATOR.
 *   5. Answer through resumeHumanQueryFromOperator().
 *   6. Verify HumanQuery becomes ANSWERED.
 *   7. Verify thread resumes at GROUND.
 *   8. Verify KnowledgeCandidate is created.
 *   9. Verify operator answer is delivered to the user.
 *  10. Verify Shauri resumes with the operator answer.
 *  11. Verify Shauri's response is delivered to the user.
 *  12. Verify outbound message audit records exist.
 *
 * External services are NOT used.
 *
 * WhatsApp and graph execution are injected as test doubles so this
 * test exercises our lifecycle rather than external infrastructure.
 */

import "dotenv/config";

import { prisma } from "../src/infrastructure/prisma";
import {
  createHumanQuery,
  resumeHumanQueryFromOperator,
  OperatorResumeDependencies,
} from "../src/agent/human-query";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function main() {
  console.log("========================================");
  console.log("OPERATOR HUMAN QUERY RESUME TEST");
  console.log("========================================");
  console.log("");

  let userId: string | undefined;
  let threadId: string | undefined;
  let humanQueryId: string | undefined;

  try {
    /*
     * ---------------------------------------------------------------
     * 1. Create test user
     * ---------------------------------------------------------------
     */
    console.log("[1] Creating test user...");

    const user = await prisma.user.create({
      data: {
        phone: `+2547${Date.now()
          .toString()
          .slice(-8)}`,
      },
    });

    userId = user.id;

    console.log(`✓ User created: ${user.id}`);
    console.log(`✓ Phone: ${user.phone}`);
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 2. Create test thread
     * ---------------------------------------------------------------
     */
    console.log("[2] Creating test thread...");

    const thread = await prisma.thread.create({
      data: {
        userId: user.id,
        currentPass: "GROUND",
        status: "OPEN",
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: "NONE",
      },
    });

    threadId = thread.id;

    console.log(`✓ Thread created: ${thread.id}`);
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 3. Create OPERATOR HumanQuery
     * ---------------------------------------------------------------
     */
    console.log("[3] Creating OPERATOR HumanQuery...");

    const query = await createHumanQuery({
      userId: user.id,
      threadId: thread.id,
      matter:
        "Should the user proceed with a local service provider?",
      question:
        "Can you confirm whether this service provider is reliable?",
      knownContext:
        JSON.stringify({
          decision: "service-provider selection",
        }),
      reason:
        "The user needs local knowledge that Shauri cannot reliably establish.",
      source: "OPERATOR",
    });

    humanQueryId = query.id;

    console.log(`✓ HumanQuery created: ${query.id}`);
    console.log(`✓ Source: ${query.source}`);
    console.log(`✓ Status: ${query.status}`);

    assert(
      query.source === "OPERATOR",
      `Expected OPERATOR source, got ${query.source}`,
    );

    assert(
      query.status === "OPEN",
      `Expected OPEN status, got ${query.status}`,
    );

    console.log("");

    /*
     * ---------------------------------------------------------------
     * 4. Verify operator pause state
     * ---------------------------------------------------------------
     */
    console.log("[4] Verifying operator pause state...");

    const pausedThread =
      await prisma.thread.findUniqueOrThrow({
        where: {
          id: thread.id,
        },
      });

    assert(
      pausedThread.awaitingHuman === true,
      "Thread must be awaitingHuman=true",
    );

    assert(
      pausedThread.awaitingSource === "OPERATOR",
      `Thread must await OPERATOR, got ${pausedThread.awaitingSource}`,
    );

    console.log("✓ awaitingHuman=true");
    console.log("✓ awaitingSource=OPERATOR");
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 5. Inject fake external dependencies
     * ---------------------------------------------------------------
     */
    console.log(
      "[5] Answering through operator resume path...",
    );

    const operatorAnswer =
      "Yes. The operator confirms that this provider has been used successfully by members of the local community.";

    const sentMessages: Array<{
      phone: string;
      message: string;
    }> = [];

    let graphCalled: boolean = false;

    const dependencies: OperatorResumeDependencies = {
      /*
       * Fake WhatsApp transport.
       *
       * No real WhatsApp credentials are required.
       */
      sendWhatsappMessage: async (
        phone,
        message,
      ) => {
        sentMessages.push({
          phone,
          message,
        });

        console.log(
          `✓ [FAKE WHATSAPP] ${phone}: ${message}`,
        );
      },

      /*
       * Fake graph execution.
       *
       * The important contract here is that the operator answer reaches
       * the graph as rawInput and that the graph is resumed for the same
       * thread/user.
       */
      runShauriGraph: async (input) => {
        graphCalled = true;

        console.log(
          `✓ [FAKE GRAPH] thread=${input.threadId}`,
        );

        console.log(
          `✓ [FAKE GRAPH] user=${input.userId}`,
        );

        console.log(
          `✓ [FAKE GRAPH] rawInput=${input.rawInput}`,
        );

        assert(
          input.threadId === thread.id,
          "Graph must resume the same thread",
        );

        assert(
          input.userId === user.id,
          "Graph must resume for the same user",
        );

        assert(
          input.rawInput === operatorAnswer,
          "Graph must receive the operator answer",
        );

        assert(
          typeof input.injectedContext === "string",
          "Graph must receive injected context",
        );

        return {
          reply:
            "Thanks. I have incorporated that local information into the decision.",
          awaitingReply: false,
        };
      },

      /*
       * Fake context builder.
       */
      buildInjectedContext: async (
        contextUserId,
        input,
      ) => {
        assert(
          contextUserId === user.id,
          "Context must be built for the same user",
        );

        assert(
          input === operatorAnswer,
          "Context builder must receive operator answer",
        );

        return JSON.stringify({
          source: "operator",
          humanQueryId: query.id,
          answer: input,
        });
      },
    };

    /*
     * Execute the actual operator lifecycle.
     */
    const result =
      await resumeHumanQueryFromOperator(
        query.id,
        operatorAnswer,
        dependencies,
      );

    console.log("✓ Operator resume path completed");
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 6. Verify HumanQuery state
     * ---------------------------------------------------------------
     */
    console.log(
      "[6] Verifying HumanQuery state...",
    );

    const answeredQuery =
      await prisma.humanQuery.findUniqueOrThrow({
        where: {
          id: query.id,
        },
      });

    assert(
      answeredQuery.status === "ANSWERED",
      `HumanQuery must be ANSWERED, got ${answeredQuery.status}`,
    );

    assert(
      answeredQuery.answer === operatorAnswer,
      "HumanQuery must contain operator answer",
    );

    assert(
      answeredQuery.answeredAt !== null,
      "HumanQuery must have answeredAt",
    );

    console.log("✓ HumanQuery status=ANSWERED");
    console.log("✓ Operator answer persisted");
    console.log("✓ answeredAt recorded");
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 7. Verify thread resume state
     * ---------------------------------------------------------------
     */
    console.log(
      "[7] Verifying thread resume state...",
    );

    const resumedThread =
      await prisma.thread.findUniqueOrThrow({
        where: {
          id: thread.id,
        },
      });

    assert(
      resumedThread.awaitingHuman === false,
      "awaitingHuman must be false after operator answer",
    );

    assert(
      resumedThread.awaitingSource === "NONE",
      `awaitingSource must be NONE after answer, got ${resumedThread.awaitingSource}`,
    );

    assert(
      resumedThread.currentPass === "GROUND",
      `Thread must resume at GROUND, got ${resumedThread.currentPass}`,
    );

    assert(
      resumedThread.awaitingReply === false,
      "awaitingReply must be false after operator answer",
    );

    console.log("✓ awaitingHuman=false");
    console.log("✓ awaitingSource=NONE");
    console.log("✓ currentPass=GROUND");
    console.log("✓ awaitingReply=false");
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 8. Verify human evidence
     * ---------------------------------------------------------------
     */
    console.log(
      "[8] Verifying human evidence...",
    );

    assert(
      resumedThread.known.some(
        (item) =>
          item ===
          `Human-provided evidence: ${operatorAnswer}`,
      ),
      "Operator answer must be added to thread.known",
    );

    console.log("✓ Operator evidence added to thread.known");
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 9. Verify KnowledgeCandidate
     * ---------------------------------------------------------------
     */
    console.log(
      "[9] Verifying KnowledgeCandidate...",
    );

    const candidates =
      await prisma.knowledgeCandidate.findMany({
        where: {
          threadId: thread.id,
        },
      });

    assert(
      candidates.length === 1,
      `Expected exactly 1 KnowledgeCandidate, got ${candidates.length}`,
    );

    assert(
      candidates[0].proposition === operatorAnswer,
      "KnowledgeCandidate must contain operator answer",
    );

    console.log("✓ Exactly one KnowledgeCandidate created");
    console.log("✓ Candidate contains operator answer");
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 10. Verify graph execution
     * ---------------------------------------------------------------
     */
    console.log(
      "[10] Verifying graph resume...",
    );

    assert(
      graphCalled,
      "runShauriGraph must be called",
    );

    assert(
      result.reply.length > 0,
      "Operator resume must return Shauri reply",
    );

    console.log("✓ runShauriGraph() was called");
    console.log("✓ Shauri produced a response");
    console.log("");

    /*
     * ---------------------------------------------------------------
     * 11. Verify WhatsApp delivery
     * ---------------------------------------------------------------
     */
    console.log(
      "[11] Verifying WhatsApp delivery...",
    );

    const operatorDelivery =
      sentMessages.find(
        (message) =>
          message.phone === user.phone &&
          message.message === operatorAnswer,
      );

    assert(
      operatorDelivery !== undefined,
      "Operator answer must be sent to user",
    );

    const shauriDelivery =
      sentMessages.find(
        (message) =>
          message.phone === user.phone &&
          message.message === result.reply,
      );

    assert(
      shauriDelivery !== undefined,
      "Shauri response must be sent to user",
    );

    assert(
      sentMessages.length === 2,
      `Expected exactly 2 WhatsApp messages, got ${sentMessages.length}`,
    );

    console.log(
      "✓ Operator answer delivered to user",
    );

    console.log(
      "✓ Shauri response delivered to user",
    );

    console.log(
      "✓ Exactly two WhatsApp messages sent",
    );

    console.log("");

    /*
     * ---------------------------------------------------------------
     * 12. Verify outbound message audit trail
     * ---------------------------------------------------------------
     */
    console.log(
      "[12] Verifying outbound message audit trail...",
    );

    const messages =
      await prisma.message.findMany({
        where: {
          threadId: thread.id,
          direction: "OUT",
        },
        orderBy: {
          createdAt: "asc",
        },
      });

    assert(
      messages.length === 2,
      `Expected 2 outbound messages, got ${messages.length}`,
    );

    const operatorMessage =
      messages.find(
        (message) =>
          message.content === operatorAnswer &&
          (message.metadata as any)?.source ===
            "human_operator",
      );

    assert(
      operatorMessage !== undefined,
      "Operator answer audit message is missing",
    );

    const shauriMessage =
      messages.find(
        (message) =>
          message.content === result.reply &&
          (message.metadata as any)?.source ===
            "shauri_resume",
      );

    assert(
      shauriMessage !== undefined,
      "Shauri resume audit message is missing",
    );

    console.log(
      "✓ Operator answer audit record exists",
    );

    console.log(
      "✓ Shauri response audit record exists",
    );

    console.log("");

    /*
     * ---------------------------------------------------------------
     * Success
     * ---------------------------------------------------------------
     */
    console.log("========================================");
    console.log(
      "ALL OPERATOR HUMAN RESUME TESTS PASSED",
    );
    console.log("========================================");
  } finally {
    /*
     * ---------------------------------------------------------------
     * Cleanup
     * ---------------------------------------------------------------
     *
     * Delete the test thread first because it owns several related
     * records. The user can then be removed safely.
     */
    if (threadId) {
      await prisma.message.deleteMany({
        where: {
          threadId,
        },
      });

      await prisma.knowledgeCandidate.deleteMany({
        where: {
          threadId,
        },
      });

      await prisma.humanQueryMessage.deleteMany({
        where: {
          humanQuery: {
            threadId,
          },
        },
      });

      await prisma.humanQuery.deleteMany({
        where: {
          threadId,
        },
      });

      await prisma.thread.delete({
        where: {
          id: threadId,
        },
      });
    }

    if (userId) {
      await prisma.user.delete({
        where: {
          id: userId,
        },
      });
    }

    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("");
  console.error("========================================");
  console.error("OPERATOR RESUME TEST FAILED");
  console.error("========================================");
  console.error(error);
  process.exit(1);
});