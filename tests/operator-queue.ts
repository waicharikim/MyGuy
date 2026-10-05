import "dotenv/config";

import { HumanController } from "../src/human.controller";
import { prisma } from "../src/infrastructure/prisma";
import { createHumanQuery } from "../src/agent/human-query";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function cleanup(userId: string) {
  await prisma.escalationMessage.deleteMany({
    where: { escalation: { userId } },
  });
  await prisma.escalation.deleteMany({ where: { userId } });
  await prisma.humanQueryMessage.deleteMany({
    where: { humanQuery: { userId } },
  });
  await prisma.humanQuery.deleteMany({ where: { userId } });
  await prisma.groundingEvidence.deleteMany({
    where: { thread: { userId } },
  });
  await prisma.decisionRecord.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { userId } });
  await prisma.thread.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}

async function main() {
  let userId: string | undefined;
  const previousToken = process.env.INTERNAL_OPERATOR_TOKEN;

  try {
    const user = await prisma.user.create({
      data: {
        phone: `+2547${Date.now().toString().slice(-8)}`,
        profile: {
          create: {
            summary: "Prefers stable income and low financial risk.",
            values: ["stability"],
            recurringConcerns: ["income reliability"],
          },
        },
      },
    });
    userId = user.id;

    const queryThread = await prisma.thread.create({
      data: {
        userId,
        known: ["The user has received a job offer."],
        open: ["The employer has not confirmed the start date."],
        decisionSummary: "Whether to accept the job offer.",
      },
    });

    await prisma.decisionRecord.create({
      data: {
        userId,
        threadId: queryThread.id,
        matter: "Whether to accept the job offer.",
        status: "AWAITING_HUMAN",
        decisionSummary: "Confirm the employer's start date before deciding.",
        goal: "Choose a reliable employment option.",
        recommendedOption: "Wait for confirmation of the start date.",
        confidence: 0.72,
        risks: ["Unconfirmed start date"],
        assumptions: ["The offer remains available."],
        unresolvedQuestions: ["When does the role begin?"],
        evidenceRefs: ["https://example.test/job-offer"],
        humanInputs: ["User prefers stable income."],
      },
    });

    await prisma.groundingEvidence.create({
      data: {
        threadId: queryThread.id,
        claim: "The role's start date is confirmed.",
        searchQuery: "employer start date",
        sourceUrl: "https://example.test/job-offer",
        sourceTitle: "Offer details",
        finding: "The start date is still pending confirmation.",
        confidence: 0.8,
      },
    });

    await createHumanQuery({
      userId,
      threadId: queryThread.id,
      matter: "Whether to accept the job offer.",
      question: "Can the employer confirm the start date?",
      knownContext: JSON.stringify({
        known: ["The user has received a job offer."],
      }),
      reason: "The start date is controlled by the employer.",
      source: "OPERATOR",
    });

    const escalationThread = await prisma.thread.create({
      data: {
        userId,
        known: ["The user reports a service problem."],
        decisionSummary: "Resolve the reported service problem.",
      },
    });

    await prisma.decisionRecord.create({
      data: {
        userId,
        threadId: escalationThread.id,
        matter: "Resolve the reported service problem.",
        status: "ESCALATED",
        decisionSummary: "A staff member needs to review the issue.",
        goal: "Restore the service.",
        recommendedOption: "Review the account and contact the user.",
        confidence: 0.4,
        risks: ["Service remains unavailable."],
        escalationReason: "The issue requires account-level access.",
      },
    });

    await prisma.escalation.create({
      data: {
        userId,
        threadId: escalationThread.id,
        reason: "The issue requires account-level access.",
        messages: {
          create: {
            direction: "SYSTEM",
            content: "The issue requires account-level access.",
          },
        },
      },
    });

    const controller = new HumanController();

    const dashboardHtml = controller.dashboard();
    assert(
      dashboardHtml.includes("Shauri Operator Desk") &&
        dashboardHtml.includes('request("metrics")') &&
        dashboardHtml.includes("sessionStorage") &&
        dashboardHtml.includes("textContent") &&
        dashboardHtml.includes("Open questions:"),
      "Operator dashboard should render and use the authenticated APIs.",
    );

    process.env.INTERNAL_OPERATOR_TOKEN = "operator-queue-test-token";
    let unauthorized = false;
    try {
      await controller.queue({});
    } catch {
      unauthorized = true;
    }
    assert(unauthorized, "The operator queue must reject requests without a token.");

    const queue = await controller.queue({
      "x-operator-token": "operator-queue-test-token",
    });

    assert(queue.humanQueries.length === 1, "Queue should contain the open operator query.");
    assert(queue.escalations.length === 1, "Queue should contain the open escalation.");

    const humanQuery = queue.humanQueries[0];
    assert(humanQuery.question.includes("confirm the start date"), "Question should be present.");
    assert(humanQuery.reason.includes("controlled by the employer"), "Handoff reason should be present.");
    assert(humanQuery.thread.known.includes("The user has received a job offer."), "Known facts should be included.");
    assert(humanQuery.thread.open.includes("The employer has not confirmed the start date."), "Outstanding questions should be included.");
    assert(humanQuery.thread.user.phone === user.phone, "Operator should receive the user's contact phone.");
    assert(humanQuery.thread.user.profile?.summary.includes("stable income"), "User profile summary should be included.");
    assert(humanQuery.thread.decisionRecords[0].recommendedOption?.includes("Wait for confirmation") === true, "Decision recommendation should be included.");
    assert(humanQuery.thread.decisionRecords[0].unresolvedQuestions.includes("When does the role begin?"), "Decision open questions should be included.");
    assert(humanQuery.thread.groundingEvidence[0].sourceUrl === "https://example.test/job-offer", "Grounding provenance should be included.");

    const escalation = queue.escalations[0];
    assert(escalation.reason.includes("account-level access"), "Escalation reason should be included.");
    assert(escalation.thread.decisionRecords[0].status === "ESCALATED", "Escalation decision record should be included.");

    console.log("✓ operator queue requires the configured token");
    console.log("✓ open operator queries include decision and user context");
    console.log("✓ evidence provenance appears in the handoff summary");
    console.log("✓ open escalations include their decision summary");
  } finally {
    if (previousToken === undefined) {
      delete process.env.INTERNAL_OPERATOR_TOKEN;
    } else {
      process.env.INTERNAL_OPERATOR_TOKEN = previousToken;
    }
    if (userId) {
      await cleanup(userId);
    }
  }
}

main()
  .then(() => {
    console.log("OPERATOR QUEUE TEST PASSED");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
