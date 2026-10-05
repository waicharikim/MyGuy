/**
 * Human Query Routing
 * -------------------
 *
 * Determines who should provide missing information:
 *
 *   USER
 *      → information primarily known by the person making the decision.
 *
 *   OPERATOR
 *      → information requiring external/local/system/community knowledge
 *        or responsible human verification.
 *
 * This module only determines authority.
 *
 * The HumanQuery lifecycle remains responsible for:
 * - persistence
 * - pausing
 * - answering
 * - resuming
 *
 * The graph remains responsible for deciding WHEN information is missing.
 *
 * Important:
 *
 * The router supports an optional authorityHint.
 *
 * This prevents cases where the graph already knows that a missing fact
 * requires an operator from being incorrectly classified as USER simply
 * because the LLM interprets the wording differently.
 *
 * Example:
 *
 *   EXTERNAL_FACT fallback
 *        ↓
 *   authorityHint = OPERATOR
 *        ↓
 *   OPERATOR
 *
 * For genuinely ambiguous human information, the LLM is still used to
 * distinguish USER from OPERATOR.
 */

import { HumanQuerySource } from "@prisma/client";
import { getChatModel } from "./model";

// ── Types ────────────────────────────────────────────────────────────────────

export type HumanQueryAuthorityHint =
  | "USER"
  | "OPERATOR"
  | "NONE";

export type HumanQueryRoutingInput = {
  matter: string;
  question: string;
  reason: string;
  known: string[];
  open: string[];

  /**
   * Optional deterministic authority supplied by the graph.
   *
   * USER:
   *   The graph knows the missing information belongs to the user.
   *
   * OPERATOR:
   *   The graph knows the missing information requires external human
   *   authority.
   *
   * NONE:
   *   Let the routing model determine the authority.
   */
  authorityHint?: HumanQueryAuthorityHint;
};

export type HumanQueryRoutingResult = {
  source: "USER" | "OPERATOR";
  reason: string;
  confidence: number;
};

/**
 * Minimal model contract required by this module.
 *
 * Keeping this small allows the router to be tested without depending
 * on an actual LLM provider.
 */
export type HumanQueryRoutingModel = {
  invoke: (
    messages: Array<{
      role: "system" | "user";
      content: string;
    }>
  ) => Promise<{
    content: unknown;
  }>;
};

// ── Parsing ──────────────────────────────────────────────────────────────────

function stripFences(raw: unknown): string {
  let value = String(raw ?? "").trim();

  if (value.startsWith("```")) {
    value = value
      .replace(/^```(?:json|JSON)?\s*/i, "")
      .replace(/\s*```$/i, "");
  }

  return value.trim();
}

/**
 * Parse the routing model's response defensively.
 *
 * Invalid model output defaults to USER.
 *
 * USER is the safer fallback for the existing Shauri lifecycle because
 * an invalid routing response must not accidentally grant operator
 * authority to an ordinary user message.
 */
export function parseRoutingResult(
  raw: unknown,
): HumanQueryRoutingResult {
  try {
    const parsed =
      typeof raw === "string"
        ? JSON.parse(stripFences(raw))
        : raw;

    const source =
      parsed?.source === "OPERATOR"
        ? HumanQuerySource.OPERATOR
        : HumanQuerySource.USER;

    const confidence =
      typeof parsed?.confidence === "number"
        ? Math.max(
            0,
            Math.min(1, parsed.confidence),
          )
        : 0.5;

    return {
      source,

      reason:
        typeof parsed?.reason === "string"
          ? parsed.reason
          : "Human authority selected from the information requirement.",

      confidence,
    };
  } catch {
    return {
      source:
        HumanQuerySource.USER,

      reason:
        "Routing classifier returned invalid output; defaulted to USER.",

      confidence:
        0,
    };
  }
}

// ── Deterministic authority ──────────────────────────────────────────────────

/**
 * Convert an explicit authority hint into a routing result.
 *
 * This happens BEFORE invoking the LLM.
 *
 * The reason is important because it becomes part of the HumanQuery
 * audit/context trail.
 */
function resolveAuthorityHint(
  hint: HumanQueryAuthorityHint | undefined,
): HumanQueryRoutingResult | null {
  if (
    hint === "USER"
  ) {
    return {
      source:
        HumanQuerySource.USER,

      reason:
        "Authority was explicitly identified as USER by the decision graph.",

      confidence:
        1,
    };
  }

  if (
    hint === "OPERATOR"
  ) {
    return {
      source:
        HumanQuerySource.OPERATOR,

      reason:
        "Authority was explicitly identified as OPERATOR by the decision graph.",

      confidence:
        1,
    };
  }

  return null;
}

// ── Router ───────────────────────────────────────────────────────────────────

/**
 * Determine who should answer a HumanQuery.
 *
 * Routing order:
 *
 *   1. Explicit authority hint
 *          ↓
 *   2. LLM human-authority classification
 *          ↓
 *   3. Defensive USER fallback
 *
 * USER:
 * - personal facts
 * - preferences
 * - values
 * - goals
 * - experiences
 * - circumstances
 * - constraints
 * - intentions
 * - feelings
 *
 * OPERATOR:
 * - organisation-specific information
 * - local operational knowledge
 * - community-specific knowledge
 * - service availability
 * - procedures
 * - requirements controlled by an organisation
 * - information requiring responsible human verification
 * - information requiring human intervention
 */
export async function determineHumanQuerySource(
  input: HumanQueryRoutingInput,
  model?: HumanQueryRoutingModel,
): Promise<HumanQueryRoutingResult> {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Deterministic authority
  // ──────────────────────────────────────────────────────────────────────────

  const hintedAuthority =
    resolveAuthorityHint(
      input.authorityHint,
    );

  if (
    hintedAuthority
  ) {
    return hintedAuthority;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. LLM routing
  // ──────────────────────────────────────────────────────────────────────────

  const routingModel =
    model ??
    (getChatModel(0) as unknown as HumanQueryRoutingModel);

  const response =
    await routingModel.invoke([
      {
        role: "system",

        content: `
You are Shauri's Human Information Router.

Your job is NOT to answer the question.

Your job is to determine WHO is the appropriate authority to provide
the missing information.

Choose exactly one:

USER

Use USER when the missing information is primarily known by the person
making the decision.

Examples:

- personal preferences
- personal values
- personal goals
- personal experiences
- personal circumstances
- personal constraints
- what the user wants
- what the user intends to do
- how the user feels
- information only the user can know about themselves

OPERATOR

Use OPERATOR when the missing information requires knowledge that the
user should not be expected to possess or provide.

Examples:

- organisation-specific information
- system/operator knowledge
- local operational knowledge
- community-specific knowledge
- service availability
- procedures or requirements controlled by an organisation
- information that requires someone acting on behalf of the service
- information that must be verified by a responsible human
- information that requires human intervention rather than user clarification

IMPORTANT:

Do not choose OPERATOR merely because information is uncertain.

If the user can reasonably answer the question about themselves,
choose USER.

If the answer requires an external human authority, choose OPERATOR.

The user's inability to know something does not automatically mean
OPERATOR. The key question is:

"Who has legitimate authority or first-hand knowledge to provide this
information?"

Return ONLY valid JSON:

{
  "source": "USER" | "OPERATOR",
  "reason": "short explanation",
  "confidence": 0.0
}

Do not provide advice.

Do not answer the underlying question.

Do not invent facts.

Do not return markdown.

Do not return code fences.
`.trim(),
      },

      {
        role: "user",

        content:
          JSON.stringify({
            matter:
              input.matter,

            question:
              input.question,

            reason:
              input.reason,

            known:
              input.known,

            open:
              input.open,
          }),
      },
    ]);

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Parse model output
  // ──────────────────────────────────────────────────────────────────────────

  return parseRoutingResult(
    response.content,
  );
}