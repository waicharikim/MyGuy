"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const decision_outcome_1 = require("../src/agent/decision-outcome");
const human_controller_1 = require("../src/human.controller");
const prisma_1 = require("../src/infrastructure/prisma");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function main() {
    let userId;
    const previousToken = process.env.INTERNAL_OPERATOR_TOKEN;
    try {
        const user = await prisma_1.prisma.user.create({
            data: { phone: `254700${Date.now().toString().slice(-7)}` },
        });
        userId = user.id;
        const thread = await prisma_1.prisma.thread.create({
            data: {
                userId,
                status: "CLOSED",
                currentPass: "CLOSE",
                outcomeRequestedAt: new Date(),
            },
        });
        await prisma_1.prisma.decisionRecord.create({
            data: {
                userId,
                threadId: thread.id,
                status: "RESOLVED",
                matter: "Whether to accept a job offer",
                decisionSummary: "Ask the employer to confirm the start date.",
                recommendedOption: "Wait for the confirmed start date.",
            },
        });
        const reported = await (0, decision_outcome_1.captureRequestedDecisionOutcome)(thread.id, "I accepted after the employer confirmed the start date.");
        assert(reported.outcomeStatus === client_1.DecisionOutcomeStatus.UNCLEAR, "User-submitted outcome must remain unclassified until reviewed.");
        assert(reported.outcomeSource === client_1.DecisionOutcomeSource.USER, "User outcome source must be recorded.");
        assert(reported.outcomeNotes?.includes("I accepted"), "User's outcome report must be retained verbatim.");
        assert(reported.outcomeAt !== null, "Outcome report time must be recorded.");
        const clearedThread = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: thread.id },
        });
        assert(clearedThread.outcomeRequestedAt === null, "The outcome request must be consumed after capture.");
        const controller = new human_controller_1.HumanController();
        process.env.INTERNAL_OPERATOR_TOKEN = "decision-outcome-test-token";
        const pending = await controller.outcomes({
            "x-operator-token": "decision-outcome-test-token",
        });
        assert(pending.some((entry) => entry.threadId === thread.id), "Operator outcome inbox must return unclassified user reports.");
        let unauthorized = false;
        try {
            await controller.outcomes({});
        }
        catch {
            unauthorized = true;
        }
        assert(unauthorized, "Outcome review endpoint must require the operator token.");
        let repeatedRejected = false;
        try {
            await (0, decision_outcome_1.captureRequestedDecisionOutcome)(thread.id, "A duplicate outcome report.");
        }
        catch {
            repeatedRejected = true;
        }
        assert(repeatedRejected, "A follow-up outcome request must not be consumed twice.");
        const classified = await controller.classifyOutcome(thread.id, {
            status: client_1.DecisionOutcomeStatus.SUCCESSFUL,
            notes: "Employer confirmed the start date; user accepted.",
        }, { "x-operator-token": "decision-outcome-test-token" });
        assert(classified.outcomeStatus === client_1.DecisionOutcomeStatus.SUCCESSFUL, "Operator classification must be persisted.");
        assert(classified.outcomeSource === client_1.DecisionOutcomeSource.USER, "Classification must preserve the original report source.");
        assert(classified.outcomeNotes === "I accepted after the employer confirmed the start date.", "Classification must preserve the user's original outcome report.");
        assert(classified.outcomeClassificationNotes === "Employer confirmed the start date; user accepted.", "Operator classification notes must be stored separately.");
        assert(classified.outcomeClassifiedAt !== null, "Operator classification time must be recorded.");
        let invalidStatusRejected = false;
        try {
            await controller.classifyOutcome(thread.id, { status: "MAYBE" }, { "x-operator-token": "decision-outcome-test-token" });
        }
        catch {
            invalidStatusRejected = true;
        }
        assert(invalidStatusRejected, "Invalid outcome classifications must be rejected.");
        let invalidNotesRejected = false;
        try {
            await controller.classifyOutcome(thread.id, {
                status: client_1.DecisionOutcomeStatus.SUCCESSFUL,
                notes: 123,
            }, { "x-operator-token": "decision-outcome-test-token" });
        }
        catch {
            invalidNotesRejected = true;
        }
        assert(invalidNotesRejected, "Outcome notes with an invalid type must be rejected.");
        console.log("✓ user follow-up stores an unaltered outcome report");
        console.log("✓ outcome request is consumed once");
        console.log("✓ operator access is protected and report classification is validated");
    }
    finally {
        if (previousToken === undefined) {
            delete process.env.INTERNAL_OPERATOR_TOKEN;
        }
        else {
            process.env.INTERNAL_OPERATOR_TOKEN = previousToken;
        }
        if (userId) {
            await prisma_1.prisma.decisionRecord.deleteMany({ where: { userId } });
            await prisma_1.prisma.thread.deleteMany({ where: { userId } });
            await prisma_1.prisma.user.delete({ where: { id: userId } });
        }
        await prisma_1.prisma.$disconnect();
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
