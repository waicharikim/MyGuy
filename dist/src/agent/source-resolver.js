"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInformationSource = resolveInformationSource;
exports.shouldEscalateToOperator = shouldEscalateToOperator;
/**
 * Deterministic authority policy. The model may identify a missing fact, but
 * this layer decides which source is authoritative for that fact class.
 */
function resolveInformationSource(input) {
    const sourceByType = {
        USER_INTENT: "USER",
        USER_PREFERENCE: "USER",
        USER_EXPERIENCE: "USER",
        SYSTEM_STATE: "SYSTEM",
        POLICY: "SYSTEM",
        ORGANIZATIONAL_KNOWLEDGE: "OPERATOR",
        HUMAN_VERIFICATION: "OPERATOR",
        EXTERNAL_FACT: "EXTERNAL",
    };
    return {
        fact: input.fact,
        factType: input.factType,
        preferredSource: sourceByType[input.factType],
        required: true,
        reason: input.reason || "This fact is required to continue responsibly.",
        confidence: input.confidence ?? 1,
    };
}
function shouldEscalateToOperator(need) {
    return need.preferredSource === "OPERATOR";
}
