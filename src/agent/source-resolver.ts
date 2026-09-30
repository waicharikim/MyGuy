export type InformationFactType =
  | "USER_INTENT"
  | "USER_PREFERENCE"
  | "USER_EXPERIENCE"
  | "SYSTEM_STATE"
  | "POLICY"
  | "ORGANIZATIONAL_KNOWLEDGE"
  | "HUMAN_VERIFICATION"
  | "EXTERNAL_FACT";

export type InformationSource = "USER" | "SYSTEM" | "OPERATOR" | "EXTERNAL";

export interface InformationNeed {
  fact: string;
  factType: InformationFactType;
  preferredSource: InformationSource;
  required: boolean;
  reason: string;
  confidence: number;
}

/**
 * Deterministic authority policy. The model may identify a missing fact, but
 * this layer decides which source is authoritative for that fact class.
 */
export function resolveInformationSource(input: {
  fact: string;
  factType: InformationFactType;
  reason?: string;
  confidence?: number;
}): InformationNeed {
  const sourceByType: Record<InformationFactType, InformationSource> = {
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

export function shouldEscalateToOperator(need: InformationNeed): boolean {
  return need.preferredSource === "OPERATOR";
}
