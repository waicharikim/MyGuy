"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionStatusLabel = decisionStatusLabel;
exports.formatDecisionReply = formatDecisionReply;
function decisionStatusLabel(state) {
    if (state.status === "CLOSED") {
        return "Settled";
    }
    if (state.status === "ESCALATED") {
        return "Referred to a human";
    }
    if (state.awaitingHuman && state.awaitingSource === "OPERATOR") {
        return "Waiting for human verification";
    }
    if (state.awaitingHuman && state.awaitingSource === "USER") {
        return "Waiting for your input";
    }
    if (state.pendingCloseConfirmation) {
        return "Ready to close";
    }
    if (state.awaitingReply) {
        return "Your input is needed";
    }
    return "Next step ready";
}
function formatDecisionReply(reply, state) {
    return `Decision status: ${decisionStatusLabel(state)}\n\n${reply}`;
}
