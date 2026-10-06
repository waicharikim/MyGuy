"use strict";
/**
 * Human Query Routing Test
 * ------------------------
 *
 * Tests the authority classifier independently from:
 *
 * - HumanQuery persistence
 * - Thread state
 * - WhatsApp
 * - LangGraph
 * - external LLM providers
 *
 * The model is injected so the test can deterministically simulate
 * USER / OPERATOR / malformed model responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const human_routing_1 = require("../src/agent/human-routing");
// ── Test helpers ─────────────────────────────────────────────────────────────
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
function createFakeModel(response) {
    return {
        async invoke() {
            return {
                content: response,
            };
        },
    };
}
const baseInput = {
    matter: "Should I use the community service?",
    question: "Is the service currently available?",
    reason: "Availability must be verified.",
    known: [],
    open: ["service availability"],
};
// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log("========================================");
    console.log("HUMAN QUERY ROUTING TEST");
    console.log("========================================");
    // ──────────────────────────────────────────────────────────────────────────
    // 1. USER routing
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[1] Testing USER routing...");
    const userModel = createFakeModel(JSON.stringify({
        source: "USER",
        reason: "This is a personal preference.",
        confidence: 0.94,
    }));
    const userResult = await (0, human_routing_1.determineHumanQuerySource)({
        ...baseInput,
        question: "Which option would you personally prefer?",
        reason: "Shauri needs the user's preference.",
    }, userModel);
    assert(userResult.source === client_1.HumanQuerySource.USER, `Expected USER, got ${userResult.source}`);
    assert(userResult.confidence === 0.94, `Expected confidence 0.94, got ${userResult.confidence}`);
    assert(userResult.reason.includes("personal"), "Expected USER routing reason to be preserved");
    console.log("✓ USER routing selected correctly");
    console.log(`✓ Confidence: ${userResult.confidence}`);
    // ──────────────────────────────────────────────────────────────────────────
    // 2. OPERATOR routing
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[2] Testing OPERATOR routing...");
    const operatorModel = createFakeModel(JSON.stringify({
        source: "OPERATOR",
        reason: "The organisation controls this information.",
        confidence: 0.97,
    }));
    const operatorResult = await (0, human_routing_1.determineHumanQuerySource)({
        ...baseInput,
        question: "What procedure does the organisation currently require?",
        reason: "This is organisation-specific information.",
    }, operatorModel);
    assert(operatorResult.source === client_1.HumanQuerySource.OPERATOR, `Expected OPERATOR, got ${operatorResult.source}`);
    assert(operatorResult.confidence === 0.97, `Expected confidence 0.97, got ${operatorResult.confidence}`);
    console.log("✓ OPERATOR routing selected correctly");
    console.log(`✓ Confidence: ${operatorResult.confidence}`);
    // ──────────────────────────────────────────────────────────────────────────
    // 3. Confidence clamping
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[3] Testing confidence clamping...");
    const highConfidence = (0, human_routing_1.parseRoutingResult)(JSON.stringify({
        source: "OPERATOR",
        reason: "Verified authority.",
        confidence: 4,
    }));
    assert(highConfidence.confidence === 1, `Expected confidence to clamp to 1, got ${highConfidence.confidence}`);
    const lowConfidence = (0, human_routing_1.parseRoutingResult)(JSON.stringify({
        source: "USER",
        reason: "Personal information.",
        confidence: -3,
    }));
    assert(lowConfidence.confidence === 0, `Expected confidence to clamp to 0, got ${lowConfidence.confidence}`);
    console.log("✓ High confidence clamped to 1");
    console.log("✓ Low confidence clamped to 0");
    // ──────────────────────────────────────────────────────────────────────────
    // 4. Missing confidence
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[4] Testing missing confidence...");
    const missingConfidence = (0, human_routing_1.parseRoutingResult)(JSON.stringify({
        source: "USER",
        reason: "Personal preference.",
    }));
    assert(missingConfidence.confidence === 0.5, `Expected default confidence 0.5, got ${missingConfidence.confidence}`);
    console.log("✓ Missing confidence defaults to 0.5");
    // ──────────────────────────────────────────────────────────────────────────
    // 5. Invalid source
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[5] Testing invalid source fallback...");
    const invalidSource = (0, human_routing_1.parseRoutingResult)(JSON.stringify({
        source: "SOMETHING_ELSE",
        reason: "Invalid source.",
        confidence: 0.8,
    }));
    assert(invalidSource.source === client_1.HumanQuerySource.USER, `Expected invalid source to default to USER, got ${invalidSource.source}`);
    console.log("✓ Invalid source defaults to USER");
    // ──────────────────────────────────────────────────────────────────────────
    // 6. Malformed model output
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[6] Testing malformed model output...");
    const malformed = (0, human_routing_1.parseRoutingResult)("this is not valid JSON");
    assert(malformed.source === client_1.HumanQuerySource.USER, `Expected malformed output to default to USER, got ${malformed.source}`);
    assert(malformed.confidence === 0, `Expected malformed output confidence 0, got ${malformed.confidence}`);
    console.log("✓ Malformed output safely defaults to USER");
    console.log("✓ Malformed output confidence = 0");
    // ──────────────────────────────────────────────────────────────────────────
    // 7. Markdown JSON fences
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[7] Testing fenced JSON parsing...");
    const fenced = (0, human_routing_1.parseRoutingResult)(`
\`\`\`json
{
  "source": "OPERATOR",
  "reason": "Requires local organisational knowledge.",
  "confidence": 0.91
}
\`\`\`
  `);
    assert(fenced.source === client_1.HumanQuerySource.OPERATOR, `Expected fenced JSON to parse as OPERATOR, got ${fenced.source}`);
    assert(fenced.confidence === 0.91, `Expected confidence 0.91, got ${fenced.confidence}`);
    console.log("✓ Fenced JSON parsed correctly");
    // ──────────────────────────────────────────────────────────────────────────
    // 8. Verify model receives routing context
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n[8] Verifying model input...");
    let receivedUserPayload = "";
    const inspectingModel = {
        async invoke(messages) {
            receivedUserPayload = messages[1]?.content ?? "";
            return {
                content: JSON.stringify({
                    source: "USER",
                    reason: "Personal information.",
                    confidence: 0.88,
                }),
            };
        },
    };
    await (0, human_routing_1.determineHumanQuerySource)({
        matter: "Moving to another city",
        question: "How comfortable are you with moving?",
        reason: "Need the user's personal preference.",
        known: ["User is considering two cities."],
        open: ["comfort with relocation"],
    }, inspectingModel);
    const payload = JSON.parse(receivedUserPayload);
    assert(payload.matter === "Moving to another city", "Model did not receive matter");
    assert(payload.question === "How comfortable are you with moving?", "Model did not receive question");
    assert(payload.reason === "Need the user's personal preference.", "Model did not receive reason");
    assert(Array.isArray(payload.known), "Model did not receive known facts");
    assert(Array.isArray(payload.open), "Model did not receive open facts");
    console.log("✓ Matter passed to router");
    console.log("✓ Question passed to router");
    console.log("✓ Reason passed to router");
    console.log("✓ Known facts passed to router");
    console.log("✓ Open facts passed to router");
    let routingInstructions = "";
    const privateThirdPartyFactModel = {
        async invoke(messages) {
            routingInstructions = messages[0]?.content ?? "";
            return {
                content: JSON.stringify({
                    source: "USER",
                    reason: "The user must obtain or share their private offer details.",
                    confidence: 0.95,
                }),
            };
        },
    };
    const privateThirdPartyFact = await (0, human_routing_1.determineHumanQuerySource)({
        matter: "Whether to accept a job offer",
        question: "Can the employer confirm the start date?",
        reason: "The offer's start date is controlled by the employer.",
        known: ["The user has received a job offer."],
        open: ["The start date is unconfirmed."],
        authorityHint: "NONE",
    }, privateThirdPartyFactModel);
    assert(privateThirdPartyFact.source === client_1.HumanQuerySource.USER, "Private third-party facts should be routed to the user to obtain, not assumed to be an operator task.");
    assert(routingInstructions.includes("Do not assume the operator can contact or act for an unrelated employer"), "Router instructions must distinguish an external employer from an authorized Shauri operator.");
    console.log("✓ Private employer-controlled facts are routed to the user");
    console.log("✓ Operator routing requires explicit service authority or access");
    // ──────────────────────────────────────────────────────────────────────────
    // Complete
    // ──────────────────────────────────────────────────────────────────────────
    console.log("\n========================================");
    console.log("ALL HUMAN QUERY ROUTING TESTS PASSED");
    console.log("========================================");
}
main().catch((error) => {
    console.error("\n========================================");
    console.error("HUMAN QUERY ROUTING TEST FAILED");
    console.error("========================================");
    console.error(error);
    process.exit(1);
});
