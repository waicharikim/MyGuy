/**
 * Smoke: thread isolation test.
 *
 * Verifies that an unrelated new decision does NOT get attached
 * to an existing open decision thread.
 *
 * Expected:
 *
 * Turn 1 → creates accounting/freelance matter
 * Turn 2 → continues accounting/freelance matter
 * Turn 3 → starts a NEW matter about buying land
 *
 * This specifically tests the thread-resolver change:
 *
 *   one open thread != automatic continuation
 */

import "dotenv/config";

import { handleMessage } from "../src/agent/central";
import { prisma } from "../src/infrastructure/prisma";
import { resetSmokeUser } from "./reset-smoke";

async function main(): Promise<void> {
  const phone = "254700000001";

  /*
   * ---------------------------------------------------------------
   * RESET
   * ---------------------------------------------------------------
   *
   * Remove all previous smoke-test state for this phone.
   */

  await resetSmokeUser(phone);

  /*
   * ---------------------------------------------------------------
   * TURN 1
   * ---------------------------------------------------------------
   */

  const turn1 = await handleMessage(
    phone,
    "Should I take the accounting job in Nairobi or stay freelance?",
  );

  console.log(
    "--- Turn 1 ---\n",
    turn1.reply,
    "\n",
  );

  /*
   * ---------------------------------------------------------------
   * TURN 2
   *
   * This clearly belongs to the accounting/freelance matter.
   * ---------------------------------------------------------------
   */

  const turn2 = await handleMessage(
    phone,
    "I've freelanced for 2 years. The income is unstable, but I really like the flexibility.",
  );

  console.log(
    "--- Turn 2 ---\n",
    turn2.reply,
    "\n",
  );

  /*
   * ---------------------------------------------------------------
   * GET TEST USER
   * ---------------------------------------------------------------
   */

  const user = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (!user) {
    throw new Error(
      "Smoke test user was not created.",
    );
  }

  /*
   * ---------------------------------------------------------------
   * THREADS BEFORE TURN 3
   * ---------------------------------------------------------------
   */

  const before = await prisma.thread.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  console.log(
    "Threads before unrelated decision:",
    before.map((thread) => ({
      id: thread.id,
      status: thread.status,
      decisionSummary: thread.decisionSummary,
      known: thread.known,
      open: thread.open,
      currentPass: thread.currentPass,
      awaitingReply: thread.awaitingReply,
      awaitingHuman: thread.awaitingHuman,
      awaitingSource: thread.awaitingSource,
    })),
    "\n",
  );

  if (before.length !== 1) {
    throw new Error(
      `EXPECTED exactly 1 thread before Turn 3, but found ${before.length}.`,
    );
  }

  /*
   * ---------------------------------------------------------------
   * TURN 3
   *
   * Completely unrelated decision.
   *
   * This MUST create a new thread.
   * ---------------------------------------------------------------
   */

  const turn3 = await handleMessage(
    phone,
    "Should I buy a plot of land near my parents' home?",
  );

  console.log(
    "--- Turn 3 ---\n",
    turn3.reply,
    "\n",
  );

  /*
   * ---------------------------------------------------------------
   * FINAL THREAD STATE
   * ---------------------------------------------------------------
   */

  const finalUser = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (!finalUser) {
    throw new Error(
      "Smoke test user was not found after Turn 3.",
    );
  }

  const threads = await prisma.thread.findMany({
    where: {
      userId: finalUser.id,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  console.log(
    "\n=== FINAL THREAD STATE ===\n",
  );

  for (const [index, thread] of threads.entries()) {
    console.log(`THREAD ${index + 1}`);

    console.log({
      id: thread.id,
      status: thread.status,
      decisionSummary: thread.decisionSummary,
      known: thread.known,
      open: thread.open,
      currentPass: thread.currentPass,
      awaitingReply: thread.awaitingReply,
      awaitingHuman: thread.awaitingHuman,
      awaitingSource: thread.awaitingSource,
    });

    console.log(
      "Messages:",
      thread.messages.map((message) => ({
        direction: message.direction,
        content: message.content,
      })),
    );

    console.log();
  }

  /*
   * ---------------------------------------------------------------
   * ASSERTION 1
   *
   * We must now have exactly two threads.
   * ---------------------------------------------------------------
   */

  if (threads.length !== 2) {
    throw new Error(
      `EXPECTED exactly 2 threads after Turn 3, but found ${threads.length}. ` +
        "The unrelated land decision was not isolated into a new thread.",
    );
  }

  const firstThread = threads[0];
  const secondThread = threads[1];

  /*
   * ---------------------------------------------------------------
   * BUILD SEARCHABLE MESSAGE TEXT
   * ---------------------------------------------------------------
   */

  const firstThreadText = firstThread.messages
    .map((message) =>
      message.content.toLowerCase(),
    )
    .join(" ");

  const secondThreadText = secondThread.messages
    .map((message) =>
      message.content.toLowerCase(),
    )
    .join(" ");

  /*
   * ---------------------------------------------------------------
   * ASSERTION 2
   *
   * First thread must contain the accounting decision.
   * ---------------------------------------------------------------
   */

  if (!firstThreadText.includes("accounting job")) {
    throw new Error(
      "First thread does not contain the accounting decision.",
    );
  }

  /*
   * ---------------------------------------------------------------
   * ASSERTION 3
   *
   * First thread must contain the related freelance follow-up.
   * ---------------------------------------------------------------
   */

  if (
    !firstThreadText.includes(
      "freelanced for 2 years",
    )
  ) {
    throw new Error(
      "First thread does not contain the accounting follow-up.",
    );
  }

  /*
   * ---------------------------------------------------------------
   * ASSERTION 4
   *
   * The land decision must NOT be inside the accounting thread.
   * ---------------------------------------------------------------
   */

  if (
    firstThreadText.includes(
      "buy a plot",
    )
  ) {
    throw new Error(
      "FAIL: unrelated land decision was attached to the accounting thread.",
    );
  }

  /*
   * ---------------------------------------------------------------
   * ASSERTION 5
   *
   * Second thread must contain the land decision.
   * ---------------------------------------------------------------
   */

  if (
    !secondThreadText.includes(
      "buy a plot",
    )
  ) {
    throw new Error(
      "FAIL: the land decision was not placed in the new thread.",
    );
  }

  /*
   * ---------------------------------------------------------------
   * ASSERTION 6
   *
   * The new land thread must not contain the accounting decision.
   * ---------------------------------------------------------------
   */

  if (
    secondThreadText.includes(
      "accounting job",
    )
  ) {
    throw new Error(
      "FAIL: new land thread contains the accounting decision.",
    );
  }

  if (
    secondThreadText.includes(
      "freelanced for 2 years",
    )
  ) {
    throw new Error(
      "FAIL: new land thread contains the accounting follow-up.",
    );
  }

  console.log(
    "✅ PASS: unrelated decision created a separate thread.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      "\n❌ SMOKE TEST FAILED\n",
      error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });