"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const decision_messaging_1 = require("../src/agent/decision-messaging");
const cases = [
    {
        name: "closed matter",
        state: {
            status: "CLOSED",
            awaitingReply: false,
            awaitingHuman: false,
            awaitingSource: "NONE",
            pendingCloseConfirmation: false,
        },
        expected: "Settled",
    },
    {
        name: "escalated matter",
        state: {
            status: "ESCALATED",
            awaitingReply: false,
            awaitingHuman: false,
            awaitingSource: "NONE",
            pendingCloseConfirmation: false,
        },
        expected: "Referred to a human",
    },
    {
        name: "operator-owned pause",
        state: {
            status: "OPEN",
            awaitingReply: true,
            awaitingHuman: true,
            awaitingSource: "OPERATOR",
            pendingCloseConfirmation: false,
        },
        expected: "Waiting for human verification",
    },
    {
        name: "user-owned pause",
        state: {
            status: "OPEN",
            awaitingReply: false,
            awaitingHuman: true,
            awaitingSource: "USER",
            pendingCloseConfirmation: false,
        },
        expected: "Waiting for your input",
    },
    {
        name: "close confirmation",
        state: {
            status: "OPEN",
            awaitingReply: true,
            awaitingHuman: false,
            awaitingSource: "USER",
            pendingCloseConfirmation: true,
        },
        expected: "Ready to close",
    },
    {
        name: "ordinary next step",
        state: {
            status: "OPEN",
            awaitingReply: false,
            awaitingHuman: false,
            awaitingSource: "NONE",
            pendingCloseConfirmation: false,
        },
        expected: "Next step ready",
    },
];
for (const testCase of cases) {
    const label = (0, decision_messaging_1.decisionStatusLabel)(testCase.state);
    if (label !== testCase.expected) {
        throw new Error(`TEST FAILED: ${testCase.name}: expected "${testCase.expected}", got "${label}"`);
    }
}
const formatted = (0, decision_messaging_1.formatDecisionReply)("What matters most to you?", cases[3].state);
if (formatted !==
    "Decision status: Waiting for your input\n\nWhat matters most to you?") {
    throw new Error("TEST FAILED: formatted decision reply shape changed");
}
console.log("✓ all decision status labels map to the expected lifecycle state");
console.log("✓ reply formatter preserves message text and adds a clear status");
console.log("DECISION MESSAGING TEST PASSED");
