"use strict";
/**
 * Human Query Architecture Contracts
 *
 * Lightweight checks for the public contracts of Shauri's human-query
 * subsystem.
 *
 * This test deliberately avoids asserting implementation details such as
 * comments, exact source formatting, or which domain file contains a Prisma
 * field. Persisted-state behavior is tested by the integration test.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const source_resolver_1 = require("../src/agent/source-resolver");
const root = node_path_1.default.resolve(__dirname, "..");
function read(file) {
    return node_fs_1.default.readFileSync(node_path_1.default.join(root, file), "utf8");
}
function assert(condition, message) {
    if (!condition) {
        throw new Error(`CONTRACT FAILED: ${message}`);
    }
}
function assertContains(file, text) {
    const content = read(file);
    assert(content.includes(text), `${file} must contain:\n${text}`);
}
// -----------------------------------------------------------------------------
// Source resolution
// -----------------------------------------------------------------------------
const userPreference = (0, source_resolver_1.resolveInformationSource)({
    fact: "What does the user personally prefer?",
    factType: "USER_PREFERENCE",
});
assert(userPreference.preferredSource === "USER", "USER_PREFERENCE must resolve to USER");
const userExperience = (0, source_resolver_1.resolveInformationSource)({
    fact: "What happened to the user?",
    factType: "USER_EXPERIENCE",
});
assert(userExperience.preferredSource === "USER", "USER_EXPERIENCE must resolve to USER");
const organizationalKnowledge = (0, source_resolver_1.resolveInformationSource)({
    fact: "What policy does the organization currently follow?",
    factType: "ORGANIZATIONAL_KNOWLEDGE",
});
assert(organizationalKnowledge.preferredSource === "OPERATOR", "ORGANIZATIONAL_KNOWLEDGE must resolve to OPERATOR");
const humanVerification = (0, source_resolver_1.resolveInformationSource)({
    fact: "This requires human verification.",
    factType: "HUMAN_VERIFICATION",
});
assert(humanVerification.preferredSource === "OPERATOR", "HUMAN_VERIFICATION must resolve to OPERATOR");
const externalFact = (0, source_resolver_1.resolveInformationSource)({
    fact: "What is today's external fact?",
    factType: "EXTERNAL_FACT",
});
assert(externalFact.preferredSource === "EXTERNAL", "EXTERNAL_FACT must resolve to EXTERNAL");
// -----------------------------------------------------------------------------
// HumanQuery service
// -----------------------------------------------------------------------------
const humanQuery = read("src/agent/human-query.ts");
assertContains("src/agent/human-query.ts", "createHumanQuery");
assertContains("src/agent/human-query.ts", "answerHumanQuery");
assertContains("src/agent/human-query.ts", "HumanQuerySource");
assertContains("src/agent/human-query.ts", "knowledgeCandidate");
assertContains("src/agent/human-query.ts", "resumeHumanQueryFromOperator");
// -----------------------------------------------------------------------------
// Graph integration
// -----------------------------------------------------------------------------
const graph = read("src/agent/graph.ts");
assert(graph.includes("HumanQuery"), "graph.ts must integrate with HumanQuery");
assert(graph.includes("awaitingHuman"), "graph.ts must track pending human input");
// -----------------------------------------------------------------------------
// Operator resume integration
// -----------------------------------------------------------------------------
assertContains("src/agent/human-query.ts", "runShauriGraph");
assertContains("src/agent/human-query.ts", "sendUserMessage");
// -----------------------------------------------------------------------------
// Controller
// -----------------------------------------------------------------------------
const humanController = read("src/human.controller.ts");
assert(humanController.includes("queries/:id/answer"), "human.controller.ts must expose the HumanQuery answer endpoint");
assert(humanController.includes("resumeHumanQueryFromOperator"), "human.controller.ts must delegate operator answers to the resume workflow");
// -----------------------------------------------------------------------------
// Result
// -----------------------------------------------------------------------------
console.log("");
console.log("========================================");
console.log("HUMAN QUERY CONTRACTS");
console.log("========================================");
console.log("✓ USER source resolution");
console.log("✓ OPERATOR source resolution");
console.log("✓ EXTERNAL source resolution");
console.log("✓ HumanQuery service");
console.log("✓ Graph integration");
console.log("✓ Operator resume workflow");
console.log("✓ HumanQuery controller");
console.log("========================================");
console.log("ALL HUMAN QUERY CONTRACTS PASSED");
console.log("========================================");
