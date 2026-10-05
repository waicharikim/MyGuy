import "dotenv/config";

import {
  DecisionOutcomeSource,
  DecisionOutcomeStatus,
} from "@prisma/client";

import { captureRequestedDecisionOutcome } from "../src/agent/decision-outcome";
import { HumanController } from "../src/human.controller";
import { prisma } from "../src/infrastructure/prisma";
import { getProfileSnapshot } from "../src/agent/profile";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

async function main() {
  let userId: string | undefined;
  let metricFixtureUserId: string | undefined;
  let metricFixtureThreadId: string | undefined;
  const previousToken = process.env.INTERNAL_OPERATOR_TOKEN;

  try {
    const user = await prisma.user.create({
      data: {
        phone: `254700${Date.now().toString().slice(-7)}`,
        profile: {
          create: {
            summary: "Values stable work.",
            values: ["stability"],
            recurringConcerns: ["income security"],
          },
        },
      },
    });
    userId = user.id;

    const thread = await prisma.thread.create({
      data: {
        userId,
        status: "CLOSED",
        currentPass: "CLOSE",
        outcomeRequestedAt: new Date(),
      },
    });

    await prisma.decisionRecord.create({
      data: {
        userId,
        threadId: thread.id,
        status: "RESOLVED",
        matter: "Whether to accept a job offer",
        decisionSummary: "Ask the employer to confirm the start date.",
        recommendedOption: "Wait for the confirmed start date.",
      },
    });

    const reported = await captureRequestedDecisionOutcome(
      thread.id,
      "I accepted after the employer confirmed the start date.",
    );

    assert(
      reported.outcomeStatus === DecisionOutcomeStatus.UNCLEAR,
      "User-submitted outcome must remain unclassified until reviewed.",
    );
    assert(
      reported.outcomeSource === DecisionOutcomeSource.USER,
      "User outcome source must be recorded.",
    );
    assert(
      reported.outcomeNotes?.includes("I accepted"),
      "User's outcome report must be retained verbatim.",
    );
    assert(
      reported.outcomeAt !== null,
      "Outcome report time must be recorded.",
    );

    let profile = await prisma.userProfile.findUniqueOrThrow({
      where: { userId },
    });
    assert(profile.values.includes("stability"), "Outcome capture must preserve existing user values.");
    assert(profile.recurringConcerns.includes("income security"), "Outcome capture must preserve concerns.");
    assert(profile.pastDecisions.length === 1, "Captured outcome should appear once in decision history.");

    const clearedThread = await prisma.thread.findUniqueOrThrow({
      where: { id: thread.id },
    });
    assert(
      clearedThread.outcomeRequestedAt === null,
      "The outcome request must be consumed after capture.",
    );

    const controller = new HumanController();
    process.env.INTERNAL_OPERATOR_TOKEN = "decision-outcome-test-token";
    let metricsUnauthorized = false;
    try {
      await controller.metrics({});
    } catch {
      metricsUnauthorized = true;
    }
    assert(metricsUnauthorized, "Decision metrics must require operator authorization.");

    const metricsBefore = await controller.metrics({
      "x-operator-token": "decision-outcome-test-token",
    });

    const metricFixtureUser = await prisma.user.create({
      data: { phone: `254701${Date.now().toString().slice(-7)}` },
    });
    metricFixtureUserId = metricFixtureUser.id;
    const metricFixtureThread = await prisma.thread.create({
      data: { userId: metricFixtureUser.id, status: "CLOSED" },
    });
    metricFixtureThreadId = metricFixtureThread.id;
    const metricRecommendationTime = new Date(Date.now() - 30 * 60 * 1000);
    const previousDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.message.createMany({
      data: [
        {
          threadId: metricFixtureThread.id,
          direction: "IN",
          channel: "whatsapp",
          externalId: `metric-first-${Date.now()}`,
          content: "First user session",
          createdAt: previousDay,
        },
        {
          threadId: metricFixtureThread.id,
          direction: "IN",
          channel: "whatsapp",
          externalId: `metric-second-${Date.now()}`,
          content: "Returning user session",
        },
      ],
    });
    await prisma.decisionRecord.create({
      data: {
        userId: metricFixtureUser.id,
        threadId: metricFixtureThread.id,
        status: "RESOLVED",
        matter: "Metrics fixture",
        recommendedOption: "Take the confirmed option.",
        confidence: 0.4,
        evidenceRefs: ["https://example.test/source"],
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
        recommendedAt: metricRecommendationTime,
        closedAt: new Date(),
        outcomeStatus: "SUCCESSFUL",
        outcomeSource: "OPERATOR",
        outcomeClassifiedAt: new Date(),
      },
    });

    const metricsAfter = await controller.metrics({
      "x-operator-token": "decision-outcome-test-token",
    });
    assert(
      metricsAfter.decisions.total === metricsBefore.decisions.total + 1,
      "Total decision count should include the new resolved record.",
    );
    assert(
      metricsAfter.decisions.byStatus.RESOLVED ===
        (metricsBefore.decisions.byStatus.RESOLVED ?? 0) + 1,
      "Resolved decision count should increase by one.",
    );
    assert(
      typeof metricsAfter.decisions.byStatus.OPEN === "number" &&
        typeof metricsAfter.outcomes.byStatus.NO_ACTION === "number",
      "Metrics should return zero-filled counts for every status.",
    );
    assert(
      metricsAfter.outcomes.successfulRateAmongClassifiedActions !== null,
      "Successful rate should be defined when actionable outcomes exist.",
    );
    assert(
      metricsAfter.decisions.recommendationCoverage !== null &&
        metricsAfter.decisions.evidenceRate !== null &&
        metricsAfter.decisions.averageHoursToRecommendation !== null,
      "Recommendation, evidence, and recommendation timing metrics should be calculated.",
    );
    assert(
      metricsAfter.decisions.lowConfidenceRecommendations >=
        metricsBefore.decisions.lowConfidenceRecommendations + 1,
      "Low-confidence recommendations should be counted.",
    );
    assert(
      metricsAfter.handoffs &&
        typeof metricsAfter.handoffs.operatorQueryResponseRate !== "undefined",
      "Operator handoff response metrics should be returned.",
    );
    assert(
      metricsAfter.users.returningUsers >= metricsBefore.users.returningUsers + 1 &&
        metricsAfter.users.returnDefinition === "at_least_two_whatsapp_inbound_days",
      "Repeat-user metrics should count distinct inbound WhatsApp days.",
    );
    await prisma.decisionRecord.deleteMany({
      where: { threadId: metricFixtureThread.id },
    });
    await prisma.message.deleteMany({
      where: { threadId: metricFixtureThread.id },
    });
    await prisma.thread.delete({ where: { id: metricFixtureThread.id } });
    await prisma.user.delete({ where: { id: metricFixtureUser.id } });
    metricFixtureThreadId = undefined;
    metricFixtureUserId = undefined;

    const pending = await controller.outcomes({
      "x-operator-token": "decision-outcome-test-token",
    });
    assert(
      pending.some((entry) => entry.threadId === thread.id),
      "Operator outcome inbox must return unclassified user reports.",
    );

    let unauthorized = false;
    try {
      await controller.outcomes({});
    } catch {
      unauthorized = true;
    }
    assert(unauthorized, "Outcome review endpoint must require the operator token.");

    let repeatedRejected = false;
    try {
      await captureRequestedDecisionOutcome(
        thread.id,
        "A duplicate outcome report.",
      );
    } catch {
      repeatedRejected = true;
    }
    assert(repeatedRejected, "A follow-up outcome request must not be consumed twice.");

    const classified = await controller.classifyOutcome(
      thread.id,
      {
        status: DecisionOutcomeStatus.SUCCESSFUL,
        notes: "Employer confirmed the start date; user accepted.",
      },
      { "x-operator-token": "decision-outcome-test-token" },
    );
    assert(
      classified.outcomeStatus === DecisionOutcomeStatus.SUCCESSFUL,
      "Operator classification must be persisted.",
    );
    assert(
      classified.outcomeSource === DecisionOutcomeSource.USER,
      "Classification must preserve the original report source.",
    );
    assert(
      classified.outcomeNotes === "I accepted after the employer confirmed the start date.",
      "Classification must preserve the user's original outcome report.",
    );
    assert(
      classified.outcomeClassificationNotes === "Employer confirmed the start date; user accepted.",
      "Operator classification notes must be stored separately.",
    );
    assert(
      classified.outcomeClassifiedAt !== null,
      "Operator classification time must be recorded.",
    );

    profile = await prisma.userProfile.findUniqueOrThrow({
      where: { userId },
    });
    assert(profile.values.includes("stability"), "Classification must not alter existing user values.");
    assert(profile.pastDecisions.length === 1, "Classification must update, not duplicate, the history entry.");
    const profileEntry = profile.pastDecisions[0];
    assert(
      profileEntry !== null &&
        typeof profileEntry === "object" &&
        !Array.isArray(profileEntry) &&
        profileEntry.outcomeStatus === DecisionOutcomeStatus.SUCCESSFUL,
      "Profile history should reflect the operator's reviewed classification.",
    );
    const profileSnapshot = await getProfileSnapshot(userId);
    assert(
      profileSnapshot?.pastDecisions.length === 1,
      "Decision history should be included in future profile context.",
    );
    const afterClassification = await controller.outcomes({
      "x-operator-token": "decision-outcome-test-token",
    });
    assert(
      !afterClassification.some((entry) => entry.threadId === thread.id),
      "A classified outcome must leave the operator's pending-review inbox.",
    );

    let invalidStatusRejected = false;
    try {
      await controller.classifyOutcome(
        thread.id,
        { status: "MAYBE" },
        { "x-operator-token": "decision-outcome-test-token" },
      );
    } catch {
      invalidStatusRejected = true;
    }
    assert(invalidStatusRejected, "Invalid outcome classifications must be rejected.");

    let invalidNotesRejected = false;
    try {
      await controller.classifyOutcome(
        thread.id,
        {
          status: DecisionOutcomeStatus.SUCCESSFUL,
          notes: 123,
        },
        { "x-operator-token": "decision-outcome-test-token" },
      );
    } catch {
      invalidNotesRejected = true;
    }
    assert(invalidNotesRejected, "Outcome notes with an invalid type must be rejected.");

    console.log("✓ user follow-up stores an unaltered outcome report");
    console.log("✓ outcome request is consumed once");
    console.log("✓ authorized quality metrics reflect decision and outcome changes");
    console.log("✓ operator access is protected and report classification is validated");
  } finally {
    if (previousToken === undefined) {
      delete process.env.INTERNAL_OPERATOR_TOKEN;
    } else {
      process.env.INTERNAL_OPERATOR_TOKEN = previousToken;
    }
    if (metricFixtureThreadId) {
      await prisma.decisionRecord.deleteMany({
        where: { threadId: metricFixtureThreadId },
      });
      await prisma.message.deleteMany({
        where: { threadId: metricFixtureThreadId },
      });
      await prisma.thread.deleteMany({
        where: { id: metricFixtureThreadId },
      });
    }
    if (metricFixtureUserId) {
      await prisma.user.deleteMany({
        where: { id: metricFixtureUserId },
      });
    }
    if (userId) {
      await prisma.decisionRecord.deleteMany({ where: { userId } });
      await prisma.thread.deleteMany({ where: { userId } });
      await prisma.userProfile.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("DECISION OUTCOME TEST PASSED");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
