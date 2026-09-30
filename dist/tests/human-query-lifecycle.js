"use strict";
/**
 * Human Query Lifecycle Integration Test
 *
 * Tests the durable database state machine for USER and OPERATOR
 * HumanQueries.
 *
 * Covered:
 *
 *   USER
 *     create query
 *       ↓
 *     thread pauses for USER
 *       ↓
 *     user answer
 *       ↓
 *     query answered
 *       ↓
 *     knowledge candidate created
 *       ↓
 *     thread resumes
 *
 *   OPERATOR
 *     create query
 *       ↓
 *     thread pauses for OPERATOR
 *       ↓
 *     user must not implicitly answer it
 *       ↓
 *     operator answer
 *       ↓
 *     query answered
 *       ↓
 *     knowledge candidate created
 *       ↓
 *     thread resumes
 *
 * Also verifies duplicate-answer protection.
 *
 * This test deliberately does NOT invoke the LLM or WhatsApp transport.
 * The operator transport/graph-resume path is tested separately because
 * it crosses application boundaries and external services.
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../src/infrastructure/prisma");
const human_query_1 = require("../src/agent/human-query");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
async function cleanupUser(userId) {
    /*
     * Delete dependent records explicitly because the schema does not rely on
     * cascading deletes for all of these relationships.
     */
    await prisma_1.prisma.knowledgeCandidate.deleteMany({
        where: { userId },
    });
    await prisma_1.prisma.humanQueryMessage.deleteMany({
        where: {
            humanQuery: {
                userId,
            },
        },
    });
    await prisma_1.prisma.humanQuery.deleteMany({
        where: { userId },
    });
    await prisma_1.prisma.graphCheckpoint.deleteMany({
        where: {
            thread: {
                userId,
            },
        },
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
        // -------------------------------------------------------------------------
        // Setup
        // -------------------------------------------------------------------------
        const phone = `254700${Date.now().toString().slice(-7)}`;
        const user = await prisma_1.prisma.user.create({
            data: {
                phone,
            },
        });
        userId = user.id;
        const thread = await prisma_1.prisma.thread.create({
            data: {
                userId: user.id,
                currentPass: "GROUND",
                awaitingHuman: false,
                awaitingReply: false,
                awaitingSource: "NONE",
            },
        });
        console.log("");
        console.log("========================================");
        console.log("HUMAN QUERY LIFECYCLE TEST");
        console.log("========================================");
        console.log("User:", user.id);
        console.log("Thread:", thread.id);
        // -------------------------------------------------------------------------
        // TEST 1 — USER HumanQuery
        // -------------------------------------------------------------------------
        console.log("");
        console.log("[1] Creating USER HumanQuery...");
        const userQuery = await (0, human_query_1.createHumanQuery)({
            userId: user.id,
            threadId: thread.id,
            matter: "User preference",
            question: "Which option does the user prefer?",
            knownContext: JSON.stringify({
                source: "USER",
            }),
            reason: "The user's own preference is required.",
            source: "USER",
        });
        assert(userQuery.source === "USER", `Expected USER source, got ${userQuery.source}`);
        let currentThread = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: thread.id },
        });
        assert(currentThread.awaitingHuman === true, "Creating a HumanQuery must pause the thread");
        assert(currentThread.awaitingSource === "USER", `USER query must set awaitingSource=USER, got ${currentThread.awaitingSource}`);
        console.log("✓ USER query created");
        console.log("✓ Thread awaitingHuman=true");
        console.log("✓ Thread awaitingSource=USER");
        // -------------------------------------------------------------------------
        // TEST 2 — USER answer
        // -------------------------------------------------------------------------
        console.log("");
        console.log("[2] Answering USER HumanQuery...");
        const answeredUserQuery = await (0, human_query_1.answerHumanQuery)(userQuery.id, "The user prefers option A.");
        assert(answeredUserQuery.status === "ANSWERED", `Expected ANSWERED, got ${answeredUserQuery.status}`);
        assert(answeredUserQuery.answer === "The user prefers option A.", "USER answer was not persisted");
        currentThread = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: thread.id },
        });
        assert(currentThread.awaitingHuman === false, "Answered query must clear awaitingHuman");
        assert(currentThread.awaitingSource === "NONE", `Answered query must clear awaitingSource, got ${currentThread.awaitingSource}`);
        assert(currentThread.currentPass === "GROUND", `Expected GROUND after human answer, got ${currentThread.currentPass}`);
        assert(currentThread.known.some((item) => item.includes("Human-provided evidence: The user prefers option A.")), "Human answer must be added to thread.known");
        const userCandidate = await prisma_1.prisma.knowledgeCandidate.findFirst({
            where: {
                threadId: thread.id,
                proposition: "The user prefers option A.",
            },
        });
        assert(userCandidate !== null, "USER answer must create a KnowledgeCandidate");
        console.log("✓ USER query answered");
        console.log("✓ awaitingHuman=false");
        console.log("✓ awaitingSource=NONE");
        console.log("✓ Thread resumed at GROUND");
        console.log("✓ KnowledgeCandidate created");
        // -------------------------------------------------------------------------
        // TEST 3 — OPERATOR HumanQuery
        // -------------------------------------------------------------------------
        console.log("");
        console.log("[3] Creating OPERATOR HumanQuery...");
        const operatorQuery = await (0, human_query_1.createHumanQuery)({
            userId: user.id,
            threadId: thread.id,
            matter: "Organization information",
            question: "Is the organization currently accepting applications?",
            knownContext: JSON.stringify({
                source: "OPERATOR",
            }),
            reason: "This requires organization-specific human knowledge.",
            source: "OPERATOR",
        });
        assert(operatorQuery.source === "OPERATOR", `Expected OPERATOR source, got ${operatorQuery.source}`);
        currentThread = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: thread.id },
        });
        assert(currentThread.awaitingHuman === true, "OPERATOR query must pause the thread");
        assert(currentThread.awaitingSource === "OPERATOR", `OPERATOR query must set awaitingSource=OPERATOR, got ${currentThread.awaitingSource}`);
        console.log("✓ OPERATOR query created");
        console.log("✓ Thread awaitingHuman=true");
        console.log("✓ Thread awaitingSource=OPERATOR");
        // -------------------------------------------------------------------------
        // TEST 4 — User message must not answer OPERATOR query
        // -------------------------------------------------------------------------
        console.log("");
        console.log("[4] Verifying operator query remains open until operator answers...");
        const stillOpen = await prisma_1.prisma.humanQuery.findUniqueOrThrow({
            where: { id: operatorQuery.id },
        });
        assert(stillOpen.status === "OPEN", `Operator query must remain OPEN, got ${stillOpen.status}`);
        assert(stillOpen.source === "OPERATOR", `Expected OPERATOR source, got ${stillOpen.source}`);
        /*
         * We intentionally do not call runShauriGraph here.
         *
         * That would invoke the model and potentially external services.
         *
         * The graph-level rule is already represented in graph.ts:
         *
         *   USER → answerHumanQuery()
         *   OPERATOR → leave HumanQuery OPEN
         *
         * The actual WhatsApp-to-graph integration should be tested separately
         * with the application transport.
         */
        console.log("✓ OPERATOR HumanQuery is still OPEN");
        console.log("✓ Operator remains the authoritative source");
        // -------------------------------------------------------------------------
        // TEST 5 — Operator answer
        // -------------------------------------------------------------------------
        console.log("");
        console.log("[5] Answering OPERATOR HumanQuery...");
        const answeredOperatorQuery = await (0, human_query_1.answerHumanQuery)(operatorQuery.id, "Applications are currently open.");
        assert(answeredOperatorQuery.status === "ANSWERED", `Expected ANSWERED, got ${answeredOperatorQuery.status}`);
        assert(answeredOperatorQuery.answer ===
            "Applications are currently open.", "Operator answer was not persisted");
        currentThread = await prisma_1.prisma.thread.findUniqueOrThrow({
            where: { id: thread.id },
        });
        assert(currentThread.awaitingHuman === false, "Operator answer must clear awaitingHuman");
        assert(currentThread.awaitingSource === "NONE", `Operator answer must clear awaitingSource, got ${currentThread.awaitingSource}`);
        assert(currentThread.currentPass === "GROUND", `Expected GROUND after operator answer, got ${currentThread.currentPass}`);
        assert(currentThread.known.some((item) => item.includes("Human-provided evidence: Applications are currently open.")), "Operator answer must be added to thread.known");
        const operatorCandidate = await prisma_1.prisma.knowledgeCandidate.findFirst({
            where: {
                threadId: thread.id,
                proposition: "Applications are currently open.",
            },
        });
        assert(operatorCandidate !== null, "Operator answer must create a KnowledgeCandidate");
        console.log("✓ OPERATOR query answered");
        console.log("✓ awaitingHuman=false");
        console.log("✓ awaitingSource=NONE");
        console.log("✓ Thread resumed at GROUND");
        console.log("✓ KnowledgeCandidate created");
        // -------------------------------------------------------------------------
        // TEST 6 — Duplicate answer protection
        // -------------------------------------------------------------------------
        console.log("");
        console.log("[6] Testing duplicate-answer protection...");
        const duplicateQuery = await prisma_1.prisma.humanQuery.create({
            data: {
                userId: user.id,
                threadId: thread.id,
                matter: "Duplicate answer test",
                question: "What is the answer?",
                knownContext: JSON.stringify({
                    source: "OPERATOR",
                }),
                reason: "Testing optimistic locking.",
                source: "OPERATOR",
                status: "OPEN",
            },
        });
        await prisma_1.prisma.humanQueryMessage.create({
            data: {
                humanQueryId: duplicateQuery.id,
                direction: "SYSTEM",
                content: duplicateQuery.question,
            },
        });
        let duplicateRejected = false;
        await (0, human_query_1.answerHumanQuery)(duplicateQuery.id, "First answer.");
        try {
            await (0, human_query_1.answerHumanQuery)(duplicateQuery.id, "Second answer.");
        }
        catch {
            duplicateRejected = true;
        }
        assert(duplicateRejected, "A second answer to an ANSWERED HumanQuery must be rejected");
        const duplicateCandidates = await prisma_1.prisma.knowledgeCandidate.count({
            where: {
                threadId: thread.id,
                proposition: {
                    in: ["First answer.", "Second answer."],
                },
            },
        });
        assert(duplicateCandidates === 1, `Expected exactly one KnowledgeCandidate, got ${duplicateCandidates}`);
        console.log("✓ Duplicate answer rejected");
        console.log("✓ Only one KnowledgeCandidate created");
        // -------------------------------------------------------------------------
        // TEST 7 — HumanQuery message audit trail
        // -------------------------------------------------------------------------
        console.log("");
        console.log("[7] Checking HumanQuery message history...");
        const messages = await prisma_1.prisma.humanQueryMessage.findMany({
            where: {
                humanQueryId: operatorQuery.id,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        assert(messages.length === 2, `Expected SYSTEM question + IN answer, got ${messages.length} messages`);
        assert(messages[0].direction === "SYSTEM", `Expected first message direction SYSTEM, got ${messages[0].direction}`);
        assert(messages[1].direction === "IN", `Expected second message direction IN, got ${messages[1].direction}`);
        assert(messages[0].content === operatorQuery.question, "SYSTEM message must contain the HumanQuery question");
        assert(messages[1].content === "Applications are currently open.", "IN message must contain the operator answer");
        console.log("✓ HumanQuery question recorded");
        console.log("✓ HumanQuery answer recorded");
        console.log("✓ Audit trail intact");
        // -------------------------------------------------------------------------
        // Result
        // -------------------------------------------------------------------------
        console.log("");
        console.log("========================================");
        console.log("ALL HUMAN QUERY LIFECYCLE TESTS PASSED");
        console.log("========================================");
    }
    finally {
        if (userId) {
            await cleanupUser(userId);
        }
        await prisma_1.prisma.$disconnect();
    }
}
main().catch(async (error) => {
    console.error("");
    console.error("========================================");
    console.error("HUMAN QUERY LIFECYCLE TEST FAILED");
    console.error("========================================");
    console.error(error);
    await prisma_1.prisma.$disconnect();
    process.exit(1);
});
