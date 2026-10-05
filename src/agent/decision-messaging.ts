type DecisionMessageState = {
  status: "OPEN" | "CLOSED" | "ESCALATED";
  awaitingReply: boolean;
  awaitingHuman: boolean;
  awaitingSource: "NONE" | "USER" | "OPERATOR";
  pendingCloseConfirmation: boolean;
};

export function decisionStatusLabel(state: DecisionMessageState): string {
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

export function formatDecisionReply(
  reply: string,
  state: DecisionMessageState,
): string {
  return `Decision status: ${decisionStatusLabel(state)}\n\n${reply}`;
}
