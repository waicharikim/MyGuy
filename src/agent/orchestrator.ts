/**
 * Deprecated compatibility wrapper. Runtime orchestration now lives in
 * graph.ts; this module intentionally contains no separate state machine.
 */
import { runShauriGraph } from "./graph";
export async function runShauriStep(input: { threadId: string; userId: string; rawInput: string; injectedContext?: string }) {
  return runShauriGraph(input);
}
