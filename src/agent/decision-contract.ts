export type DecisionCloseOutput = {
  nextAction: string;
  recommendedOption: string | null;
  confidence: number | null;
  assumptions: string[];
  unresolvedRisks: string[];
  unresolvedQuestions: string[];
  escalate: boolean;
  resolved: boolean;
  humanQuery: boolean;
  decisionSummary: string;
};

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Decision close output field "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function textList(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(`Decision close output field "${field}" must be an array of non-empty strings`);
  }
  return value.map((entry: string) => entry.trim());
}

export function parseDecisionCloseOutput(raw: unknown): DecisionCloseOutput {
  if (typeof raw !== "string") {
    throw new Error("Decision close output must be JSON text");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch (error) {
    throw new Error(
      `Decision close output is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!record(parsed)) {
    throw new Error("Decision close output must be a JSON object");
  }

  const nextAction = requiredText(parsed.nextAction, "nextAction");
  const decisionSummary = requiredText(parsed.decisionSummary, "decisionSummary");
  const recommendedOption =
    parsed.recommendedOption === null
      ? null
      : requiredText(parsed.recommendedOption, "recommendedOption");
  const confidence =
    parsed.confidence === null
      ? null
      : typeof parsed.confidence === "number" &&
          Number.isFinite(parsed.confidence) &&
          parsed.confidence >= 0 &&
          parsed.confidence <= 1
        ? parsed.confidence
        : (() => {
            throw new Error(
              'Decision close output field "confidence" must be null or a number from 0 to 1',
            );
          })();

  if ((recommendedOption === null) !== (confidence === null)) {
    throw new Error(
      "Decision close output must provide both a recommendation and confidence, or neither",
    );
  }

  const flags = ["escalate", "resolved", "humanQuery"] as const;
  for (const flag of flags) {
    if (typeof parsed[flag] !== "boolean") {
      throw new Error(`Decision close output field "${flag}" must be a boolean`);
    }
  }
  if (flags.filter((flag) => parsed[flag] === true).length > 1) {
    throw new Error("Decision close output cannot resolve, escalate, and request human input at once");
  }
  if (parsed.resolved === true && recommendedOption === null) {
    throw new Error("A resolved decision must include a recommendation and confidence");
  }

  return {
    nextAction,
    decisionSummary,
    recommendedOption,
    confidence,
    assumptions: textList(parsed.assumptions, "assumptions"),
    unresolvedRisks: textList(parsed.unresolvedRisks, "unresolvedRisks"),
    unresolvedQuestions: textList(
      parsed.unresolvedQuestions,
      "unresolvedQuestions",
    ),
    escalate: parsed.escalate as boolean,
    resolved: parsed.resolved as boolean,
    humanQuery: parsed.humanQuery as boolean,
  };
}

export function formatDecisionRecommendation(
  output: Pick<DecisionCloseOutput, "nextAction" | "recommendedOption" | "confidence">,
): string {
  if (output.recommendedOption === null || output.confidence === null) {
    return output.nextAction;
  }

  const confidencePercent = Math.round(output.confidence * 100);
  return `Current recommendation: ${output.recommendedOption}\nConfidence estimate: ${confidencePercent}% (an estimate, not a guarantee).\n\n${output.nextAction}`;
}
