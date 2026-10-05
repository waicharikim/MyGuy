import "dotenv/config";

import { DecisionRecordStatus } from "@prisma/client";

import { prisma } from "../src/infrastructure/prisma";
import {
  updateDecisionRecordStatus,
  upsertDecisionRecord,
} from "../src/agent/decision-record";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function cleanupUser(userId: string) {
  await prisma.decisionRecord.deleteMany({
    where: { userId },
  });

  await prisma.thread.deleteMany({
    where: { userId },
  });

  await prisma.user.delete({
    where: { id: userId },
  });
}

async function main() {
  let userId: string | undefined;

  try {
    const phone = `254700${Date.now().toString().slice(-7)}`;

    const user = await prisma.user.create({
      data: { phone },
    });

    userId = user.id;

    const thread = await prisma.thread.create({
      data: {
        userId: user.id,
        currentPass: "INTAKE",
        status: "OPEN",
        awaitingHuman: false,
        awaitingReply: false,
        awaitingSource: "NONE",
      },
    });

    console.log("");
    console.log("========================================");
    console.log("DECISION RECORD TEST");
    console.log("========================================");
    console.log("User:", user.id);
    console.log("Thread:", thread.id);

    const created = await upsertDecisionRecord({
      userId: user.id,
      threadId: thread.id,
      matter: "Should I take the job offer?",
      status: DecisionRecordStatus.OPEN,
      decisionSummary: "The matter is still being evaluated.",
      goal: "Choose the best option for the user.",
      recommendedOption: "Wait for more information before deciding.",
      confidence: 0.55,
      risks: ["salary uncertainty", "role mismatch"],
      assumptions: ["the user wants stable work"],
      unresolvedQuestions: ["What is the confirmed salary?"],
      evidenceRefs: ["https://example.com/reasoning"],
      humanInputs: ["User-provided answer: salary target is 60k"],
    });

    assert(
      created.threadId === thread.id,
      "Decision record should be created for the thread.",
    );

    assert(
      created.status === DecisionRecordStatus.OPEN,
      "Initial decision record status should be OPEN.",
    );

    assert(
      created.matter.includes("Should I take the job offer?"),
      "Decision matter should be persisted.",
    );

    const updated = await upsertDecisionRecord({
      userId: user.id,
      threadId: thread.id,
      matter: "Should I take the job offer?",
      status: DecisionRecordStatus.AWAITING_HUMAN,
      decisionSummary: "The user needs a salary clarification before closing.",
      goal: "Clarify compensation and close the decision.",
      recommendedOption: "Ask the employer for a salary figure before accepting.",
      confidence: 0.82,
      risks: ["salary uncertainty", "role mismatch"],
      assumptions: ["the user wants stable work"],
      unresolvedQuestions: ["What is the confirmed salary?"],
      evidenceRefs: ["https://example.com/reasoning"],
      humanInputs: ["User-provided answer: salary target is 60k"],
      escalationReason: null,
    });

    assert(
      updated.status === DecisionRecordStatus.AWAITING_HUMAN,
      "Decision record should update status to AWAITING_HUMAN.",
    );

    assert(
      updated.confidence === 0.82,
      "Decision confidence should be updated.",
    );

    assert(
      updated.recommendedOption?.includes("salary") === true,
      "Recommended option should persist with the updated decision context.",
    );

    const recordCount = await prisma.decisionRecord.count({
      where: { threadId: thread.id },
    });

    assert(
      recordCount === 1,
      "There should be exactly one decision record per thread.",
    );

    const stored = await prisma.decisionRecord.findUniqueOrThrow({
      where: { threadId: thread.id },
    });

    assert(
      stored.decisionSummary.includes("salary clarification"),
      "The stored decision summary should reflect the latest state.",
    );

    assert(
      stored.risks.includes("salary uncertainty"),
      "Risk metadata should be retained.",
    );
    assert(
      stored.unresolvedQuestions.includes("What is the confirmed salary?"),
      "Unanswered material questions should be retained separately from assumptions.",
    );

    const reopened = await updateDecisionRecordStatus(
      thread.id,
      DecisionRecordStatus.OPEN,
    );
    assert(
      reopened.status === DecisionRecordStatus.OPEN,
      "A matter awaiting more user input must remain OPEN.",
    );

    const resolved = await updateDecisionRecordStatus(
      thread.id,
      DecisionRecordStatus.RESOLVED,
    );
    assert(
      resolved.status === DecisionRecordStatus.RESOLVED,
      "Confirmed closure must mark the decision record RESOLVED.",
    );

    console.log("✓ decision record created");
    console.log("✓ status updated");
    console.log("✓ confidence and recommendation persisted");
    console.log("✓ exactly one record per thread");
    console.log("✓ lifecycle transitions persist OPEN and RESOLVED statuses");
  } finally {
    if (userId) {
      await cleanupUser(userId);
    }
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("DECISION RECORD TEST PASSED");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
