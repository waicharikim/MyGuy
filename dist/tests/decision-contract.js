"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const decision_contract_1 = require("../src/agent/decision-contract");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
const valid = JSON.stringify({
    nextAction: "Compare the confirmed pay and schedule before accepting.",
    recommendedOption: "Ask the employer to confirm the start date first.",
    confidence: 0.72,
    assumptions: ["The offer remains available."],
    unresolvedRisks: ["The start date is not yet confirmed."],
    unresolvedQuestions: ["When does the role begin?"],
    escalate: false,
    resolved: false,
    humanQuery: false,
    decisionSummary: "The offer may fit if the start date is confirmed.",
});
const parsed = (0, decision_contract_1.parseDecisionCloseOutput)(valid);
assert(parsed.confidence === 0.72, "Confidence should remain within the contract.");
assert(parsed.assumptions.length === 1, "Assumptions should be retained.");
assert(parsed.unresolvedRisks.length === 1, "Risks should be retained.");
assert(parsed.unresolvedQuestions.length === 1, "Open questions should be retained.");
assert((0, decision_contract_1.formatDecisionRecommendation)(parsed).startsWith("Current recommendation: Ask the employer"), "User-facing output should state the recommendation.");
assert((0, decision_contract_1.formatDecisionRecommendation)(parsed).includes("Confidence estimate: 72%"), "User-facing output should disclose its confidence estimate.");
const noRecommendation = (0, decision_contract_1.parseDecisionCloseOutput)(JSON.stringify({
    nextAction: "Please confirm the employer's start date.",
    recommendedOption: null,
    confidence: null,
    assumptions: [],
    unresolvedRisks: ["Start date unknown"],
    unresolvedQuestions: ["When will the employer confirm the start date?"],
    escalate: false,
    resolved: false,
    humanQuery: true,
    decisionSummary: "Cannot recommend until start date is verified.",
}));
assert(!(0, decision_contract_1.formatDecisionRecommendation)(noRecommendation).includes("Confidence estimate"), "Do not display fabricated confidence when no recommendation is justified.");
const invalidCases = [
    {
        ...JSON.parse(valid),
        confidence: 1.2,
    },
    {
        ...JSON.parse(valid),
        confidence: null,
    },
    {
        ...JSON.parse(valid),
        resolved: true,
        recommendedOption: null,
        confidence: null,
    },
    {
        ...JSON.parse(valid),
        resolved: true,
        escalate: true,
    },
    {
        ...JSON.parse(valid),
        assumptions: "not an array",
    },
];
for (const output of invalidCases) {
    let rejected = false;
    try {
        (0, decision_contract_1.parseDecisionCloseOutput)(JSON.stringify(output));
    }
    catch {
        rejected = true;
    }
    assert(rejected, "Invalid close outputs must fail validation.");
}
console.log("✓ recommendation, confidence, assumptions, risks, and open questions are validated");
console.log("✓ missing recommendation does not create a fabricated confidence");
console.log("✓ inconsistent close states are rejected");
console.log("DECISION CONTRACT TEST PASSED");
