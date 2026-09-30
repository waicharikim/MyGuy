"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runShauriStep = runShauriStep;
/**
 * Deprecated compatibility wrapper. Runtime orchestration now lives in
 * graph.ts; this module intentionally contains no separate state machine.
 */
const graph_1 = require("./graph");
async function runShauriStep(input) {
    return (0, graph_1.runShauriGraph)(input);
}
