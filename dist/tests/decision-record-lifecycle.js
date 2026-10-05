"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma_1 = require("../src/infrastructure/prisma");
const decision_record_1 = require("../src/agent/decision-record");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function cleanupUser(userId) {
    await prisma_1.prisma.decisionRecord.deleteMany({
        where: { userId },
    });
    await prisma_1.prisma.thread.deleteMany({
        where: { userId },
    });
    await prisma_1.prisma.user.delete({
        where: { id: userId },
    });
}
async function main() {
    let userId;
    try {
        const phone = `254700${Date.now().toString().slice(-7)}`;
        const user = await prisma_1.prisma.user.create({
            data: { phone },
        });
        userId = user.id;
        const thread = await prisma_1.prisma.thread.create({
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
        const created = await (0, decision_record_1.upsertDecisionRecord)({
            userId: user.id,
            threadId: thread.id,
            matter: "Should I take the job offer?",
            status: client_1.DecisionRecordStatus.OPEN,
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
        assert(created.threadId === thread.id, "Decision record should be created for the thread.");
        assert(created.status === client_1.DecisionRecordStatus.OPEN, "Initial decision record status should be OPEN.");
        assert(created.matter.includes("Should I take the job offer?"), "Decision matter should be persisted.");
        const updated = await (0, decision_record_1.upsertDecisionRecord)({
            userId: user.id,
            threadId: thread.id,
            matter: "Should I take the job offer?",
            status: client_1.DecisionRecordStatus.AWAITING_HUMAN,
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
        assert(updated.status === client_1.DecisionRecordStatus.AWAITING_HUMAN, "Decision record should update status to AWAITING_HUMAN.");
        assert(updated.confidence === 0.82, "Decision confidence should be updated.");
        assert(updated.recommendedOption?.includes("salary") === true, "Recommended option should persist with the updated decision context.");
        const recordCount = await prisma_1.prisma.decisionRecord.count({
            where: { threadId: thread.id },
        });
        assert(recordCount === 1, "There should be exactly one decision record per thread.");
        const stored = await prisma_1.prisma.decisionRecord.findUniqueOrThrow({
            where: { threadId: thread.id },
        });
        assert(stored.decisionSummary.includes("salary clarification"), "The stored decision summary should reflect the latest state.");
        assert(stored.risks.includes("salary uncertainty"), "Risk metadata should be retained.");
        assert(stored.unresolvedQuestions.includes("What is the confirmed salary?"), "Unanswered material questions should be retained separately from assumptions.");
        const reopened = await (0, decision_record_1.updateDecisionRecordStatus)(thread.id, client_1.DecisionRecordStatus.OPEN);
        assert(reopened.status === client_1.DecisionRecordStatus.OPEN, "A matter awaiting more user input must remain OPEN.");
        const resolved = await (0, decision_record_1.updateDecisionRecordStatus)(thread.id, client_1.DecisionRecordStatus.RESOLVED);
        assert(resolved.status === client_1.DecisionRecordStatus.RESOLVED, "Confirmed closure must mark the decision record RESOLVED.");
        console.log("✓ decision record created");
        console.log("✓ status updated");
        console.log("✓ confidence and recommendation persisted");
        console.log("✓ exactly one record per thread");
        console.log("✓ lifecycle transitions persist OPEN and RESOLVED statuses");
    }
    finally {
        if (userId) {
            await cleanupUser(userId);
        }
        await prisma_1.prisma.$disconnect();
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
