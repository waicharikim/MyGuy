/**
 * Shauri four-pass decision engine (LangGraph).
 *
 * Path:
 *
 *   START
 *      ↓
 *   dispatch
 *      ↓
 *   intake
 *      ↓
 *   skeptic
 *      ↓
 *   ground
 *      ↓
 *   close
 *      ↓
 *   END
 *
 * Human information authority:
 *
 *   USER
 *      → information known primarily by the person making the decision.
 *
 *   OPERATOR
 *      → organisation/community/local/operational knowledge or
 *        information requiring an external human authority.
 *
 *   EXTERNAL
 *      → externally verifiable facts. Tavily is preferred.
 *
 *   SYSTEM
 *      → facts already available from Shauri/application state.
 *
 * Important:
 *
 * - The graph decides WHEN information is missing.
 * - human-routing.ts decides WHO should provide human information.
 * - human-query.ts owns HumanQuery persistence and lifecycle.
 * - Operator answers resume the graph through the operator endpoint.
 *
 * CRITICAL HUMAN-QUERY RULE:
 *
 * An OPERATOR-owned HumanQuery is a hard pause.
 *
 * An ordinary user message MUST NOT:
 *
 *   - answer it
 *   - clear awaitingHuman
 *   - clear awaitingSource
 *   - advance currentPass
 *   - rerun the graph
 *
 * The operator lifecycle owns that HumanQuery.
 */

import {
  Annotation,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";

import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { DecisionRecordStatus } from "@prisma/client";

import { getChatModel } from "./model";
import { prisma } from "../infrastructure/prisma";
import { threadState } from "../domain/thread";
import { formatDecisionReply } from "./decision-messaging";

import { createTask } from "../tools/create_task";
import { scheduleFollowup } from "../tools/schedule_followup";

import {
  createHumanQuery,
  answerHumanQuery,
} from "./human-query";
import {
  updateDecisionRecordStatus,
  upsertDecisionRecord,
} from "./decision-record";
import { captureRequestedDecisionOutcome } from "./decision-outcome";

import { notifyEscalation } from "./escalation";

import {
  updateProfileFromThread,
  getProfileSnapshot,
} from "./profile";

import {
  determineHumanQuerySource,
} from "./human-routing";


// ─────────────────────────────────────────────────────────────────────────────
// Information authority
// ─────────────────────────────────────────────────────────────────────────────

export type InformationFactType =
  | "USER_INTENT"
  | "USER_PREFERENCE"
  | "USER_EXPERIENCE"
  | "SYSTEM_STATE"
  | "POLICY"
  | "ORGANIZATIONAL_KNOWLEDGE"
  | "HUMAN_VERIFICATION"
  | "EXTERNAL_FACT";

export type InformationSource =
  | "USER"
  | "SYSTEM"
  | "OPERATOR"
  | "EXTERNAL";

export type InformationNeed = {
  question: string;
  fact: string;
  factType: InformationFactType;
  preferredSource: InformationSource;
  required: boolean;
  reason: string;
};

const informationSourceByFactType: Record<
  InformationFactType,
  InformationSource
> = {
  USER_INTENT: "USER",
  USER_PREFERENCE: "USER",
  USER_EXPERIENCE: "USER",

  SYSTEM_STATE: "SYSTEM",
  POLICY: "SYSTEM",

  ORGANIZATIONAL_KNOWLEDGE: "OPERATOR",
  HUMAN_VERIFICATION: "OPERATOR",

  EXTERNAL_FACT: "EXTERNAL",
};

function resolveInformationSource(
  need: Pick<
    InformationNeed,
    "factType" | "preferredSource"
  >,
): InformationSource {
  return (
    informationSourceByFactType[need.factType] ??
    need.preferredSource
  );
}

function requiresHumanRouting(
  need: InformationNeed,
): boolean {
  const source =
    resolveInformationSource(need);

  return (
    source === "USER" ||
    source === "OPERATOR"
  );
}

async function routeHumanInformationNeed(
  state: ShauriState,
  need: InformationNeed,
) {
  const source =
    resolveInformationSource(need);

  return determineHumanQuerySource({
    matter: state.known.join("; "),

    question:
      need.question ||
      need.fact ||
      "What information is missing?",

    reason:
      need.reason ||
      "Additional human information is required.",

    known: state.known,

    open: state.open,

    authorityHint:
      source === "USER" ||
      source === "OPERATOR"
        ? source
        : "NONE",
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Typed graph state
// ─────────────────────────────────────────────────────────────────────────────

const ShauriAnnotation =
  Annotation.Root({
    threadId:
      Annotation<string>,

    userId:
      Annotation<string>,

    rawInput:
      Annotation<string>,

    known:
      Annotation<string[]>,

    open:
      Annotation<string[]>,

    informationNeeds:
      Annotation<InformationNeed[]>,

    leaning:
      Annotation<string | null>,

    skepticArgument:
      Annotation<string | null>,

    skepticRisks:
      Annotation<string[]>,

    groundedFacts:
      Annotation<string[]>,

    groundingClaims:
      Annotation<string[]>,

    status:
      Annotation<
        "OPEN" |
        "CLOSED" |
        "ESCALATED"
      >,

    nextAction:
      Annotation<string | null>,

    awaitingReply:
      Annotation<boolean>,

    awaitingHuman:
      Annotation<boolean>,

    awaitingSource:
      Annotation<
        "NONE" |
        "USER" |
        "OPERATOR"
      >,

    pendingCloseConfirmation:
      Annotation<boolean>,

    injectedContext:
      Annotation<
        string | undefined
      >,

    resumePass:
      Annotation<
        "intake" |
        "skeptic" |
        "ground" |
        "close"
      >,
  });

export type ShauriState =
  typeof ShauriAnnotation.State;


// ─────────────────────────────────────────────────────────────────────────────
// Models and tools
// ─────────────────────────────────────────────────────────────────────────────

const getModel = () =>
  getChatModel(0.25);

const getFastModel = () =>
  getChatModel(0);

const getTavily =
  (): TavilySearchResults | null =>
    process.env.TAVILY_API_KEY
      ? new TavilySearchResults({
          maxResults: 5,
        })
      : null;


// ─────────────────────────────────────────────────────────────────────────────
// JSON helpers
// ─────────────────────────────────────────────────────────────────────────────

function stripFences(
  raw: unknown,
): string {
  let s =
    String(raw ?? "").trim();

  if (s.startsWith("```")) {
    s =
      s
        .replace(
          /^```(?:json|JSON)?\s*/i,
          "",
        )
        .replace(
          /\s*```$/i,
          "",
        );
  }

  return s.trim();
}

function json<T>(
  value: unknown,
  fallback: T,
): T {
  try {
    return JSON.parse(
      stripFences(value),
    ) as T;
  } catch {
    return fallback;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint
// ─────────────────────────────────────────────────────────────────────────────

async function checkpoint(
  state: ShauriState,
  pass:
    | "INTAKE"
    | "SKEPTIC"
    | "GROUND"
    | "CLOSE",
) {
  await prisma.graphCheckpoint.create({
    data: {
      threadId:
        state.threadId,

      graphThreadId:
        state.threadId,

      pass,

      state:
        JSON.parse(
          JSON.stringify(state),
        ),
    },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// HumanQuery integration
// ─────────────────────────────────────────────────────────────────────────────

async function createRoutedHumanQuery(
  state: ShauriState,
  need: InformationNeed,
  options?: {
    fallbackFor?: string;
  },
) {
  const routing =
    await routeHumanInformationNeed(
      state,
      need,
    );

  const source =
    routing.source;

  const knownContext =
    JSON.stringify({
      known:
        state.known,

      open:
        state.open,

      informationNeed:
        need,

      routing: {
        source,

        reason:
          routing.reason,

        confidence:
          routing.confidence,
      },

      ...(options?.fallbackFor
        ? {
            fallbackFor:
              options.fallbackFor,
          }
        : {}),
    });

  const q =
    await createHumanQuery({
      userId:
        state.userId,

      threadId:
        state.threadId,

      matter:
        state.known.join("; "),

      question:
        need.question ||
        need.fact ||
        "What information is missing?",

      knownContext,

      reason:
        routing.reason ||
        need.reason ||
        "Additional human information is required.",

      source:
        source === "OPERATOR"
          ? "OPERATOR"
          : "USER",
    });

  return {
    q,
    source,
    routing,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Intake
// ─────────────────────────────────────────────────────────────────────────────

async function intake(
  state: ShauriState,
): Promise<Partial<ShauriState>> {
  const profile =
    await getProfileSnapshot(
      state.userId,
    );

  const res =
    await getModel().invoke([
      {
        role: "system",

        content: `
You are Shauri's Intake pass.

Establish:

1. The actual decision.
2. Facts already known.
3. Unresolved facts.
4. Which unresolved facts are necessary before reasoning responsibly.

For every unresolved fact, classify the information type.

Use exactly one of:

USER_INTENT
USER_PREFERENCE
USER_EXPERIENCE
SYSTEM_STATE
POLICY
ORGANIZATIONAL_KNOWLEDGE
HUMAN_VERIFICATION
EXTERNAL_FACT

Definitions:

USER_INTENT:
What the user wants or intends.

USER_PREFERENCE:
Personal preference, values, priorities or constraints.

USER_EXPERIENCE:
Something that happened to or was experienced by the user.

SYSTEM_STATE:
Information already known by the application.

POLICY:
Rules or policies controlled by the relevant system or organisation.

ORGANIZATIONAL_KNOWLEDGE:
Knowledge held by an organisation, community or responsible operator.

HUMAN_VERIFICATION:
Something requiring verification by a responsible human.

EXTERNAL_FACT:
A factual claim that can be verified from external sources.

Return ONLY JSON:

{
  "needsClarification": boolean,
  "question": "",
  "known": [],
  "open": [],
  "decisionSummary": "",
  "informationNeeds": [
    {
      "question": "",
      "fact": "",
      "factType": "USER_INTENT|USER_PREFERENCE|USER_EXPERIENCE|SYSTEM_STATE|POLICY|ORGANIZATIONAL_KNOWLEDGE|HUMAN_VERIFICATION|EXTERNAL_FACT",
      "preferredSource": "USER|SYSTEM|OPERATOR|EXTERNAL",
      "required": true,
      "reason": ""
    }
  ]
}

Ask only for information essential to reason responsibly.

Do not ask the user for information whose authoritative source
is SYSTEM or OPERATOR.

Do not fabricate facts.

${
  state.injectedContext
    ? `
Existing context:

${state.injectedContext}
`
    : ""
}

${
  profile
    ? `
User profile:

${JSON.stringify(profile)}
`
    : ""
}
`.trim(),
      },

      {
        role: "user",

        content:
          state.rawInput,
      },
    ]);

  const parsed =
    json<{
      needsClarification: boolean;
      question: string;
      known: string[];
      open: string[];
      decisionSummary: string;
      informationNeeds:
        InformationNeed[];
    }>(
      res.content,
      {
        needsClarification:
          true,

        question:
          String(res.content),

        known:
          state.known,

        open:
          state.open,

        decisionSummary:
          "",

        informationNeeds:
          [],
      },
    );

  const known =
    Array.isArray(
      parsed.known,
    )
      ? parsed.known.filter(Boolean)
      : state.known;

  const open =
    Array.isArray(
      parsed.open,
    )
      ? parsed.open.filter(Boolean)
      : state.open;

  const informationNeeds =
    Array.isArray(
      parsed.informationNeeds,
    )
      ? parsed.informationNeeds
          .filter(Boolean)
          .map((need) => ({
            ...need,

            preferredSource:
              resolveInformationSource(
                need,
              ),
          }))
      : [];

  const requiredHumanNeeds =
    informationNeeds.filter(
      (need) =>
        need.required &&
        requiresHumanRouting(
          need,
        ),
    );

  if (
    requiredHumanNeeds.length > 0
  ) {
    const first =
      requiredHumanNeeds[0];

    const {
      q,
      source,
    } =
      await createRoutedHumanQuery(
        state,
        first,
      );

    if (
      source === "USER"
    ) {
      await prisma.thread.update({
        where: {
          id:
            state.threadId,
        },

        data: {
          known,

          open:
            Array.from(
              new Set([
                ...open,
                q.question,
              ]),
            ),

          currentPass:
            "INTAKE",

          awaitingReply:
            false,

          awaitingHuman:
            true,

          awaitingSource:
            "USER",

          decisionSummary:
            parsed.decisionSummary ||
            undefined,
        },
      });

      const next:
        Partial<ShauriState> = {
        ...state,

        known,

        open,

        informationNeeds,

        awaitingHuman:
          true,

        awaitingSource:
          "USER",

        awaitingReply:
          false,

        nextAction:
          q.question,

        resumePass:
          "intake",
      };

      await checkpoint(
        {
          ...state,
          ...next,
        } as ShauriState,
        "INTAKE",
      );

      return next;
    }

    if (
      source === "OPERATOR"
    ) {
      await prisma.thread.update({
        where: {
          id:
            state.threadId,
        },

        data: {
          known,

          open:
            Array.from(
              new Set([
                ...open,
                q.question,
              ]),
            ),

          currentPass:
            "INTAKE",

          awaitingReply:
            false,

          awaitingHuman:
            true,

          awaitingSource:
            "OPERATOR",

          decisionSummary:
            parsed.decisionSummary ||
            undefined,
        },
      });

      const next:
        Partial<ShauriState> = {
        ...state,

        known,

        open,

        informationNeeds,

        awaitingHuman:
          true,

        awaitingSource:
          "OPERATOR",

        awaitingReply:
          false,

        nextAction:
          q.question,

        resumePass:
          "intake",
      };

      await checkpoint(
        {
          ...state,
          ...next,
        } as ShauriState,
        "INTAKE",
      );

      return next;
    }
  }

  await prisma.thread.update({
    where: {
      id:
        state.threadId,
    },

    data: {
      known,

      open,

      currentPass:
        "SKEPTIC",

      awaitingReply:
        false,

      awaitingHuman:
        false,

      awaitingSource:
        "NONE",

      decisionSummary:
        parsed.decisionSummary ||
        undefined,
    },
  });

  const next:
    Partial<ShauriState> = {
    ...state,

    known,

    open,

    informationNeeds,

    awaitingReply:
      false,

    awaitingHuman:
      false,

    awaitingSource:
      "NONE",

    nextAction:
      null,

    resumePass:
      "skeptic",
  };

  await checkpoint(
    {
      ...state,
      ...next,
    } as ShauriState,
    "INTAKE",
  );

  return next;
}


// ─────────────────────────────────────────────────────────────────────────────
// Skeptic
// ─────────────────────────────────────────────────────────────────────────────

async function skeptic(
  state: ShauriState,
): Promise<Partial<ShauriState>> {
  const res =
    await getModel().invoke([
      {
        role: "system",

        content: `
You are the Skeptic pass.

Identify:

- the user's apparent leaning
- the strongest assumptions behind it
- concrete risks
- counterarguments
- facts that could change the decision

Do not make the decision for the user.

Return ONLY JSON:

{
  "leaning": "",
  "argument": "",
  "risks": [""],
  "decisionChangingFacts": [""]
}
`.trim(),
      },

      {
        role: "user",

        content:
          JSON.stringify({
            known:
              state.known,

            open:
              state.open,
          }),
      },
    ]);

  const parsed =
    json<{
      leaning: string;
      argument: string;
      risks: string[];
      decisionChangingFacts:
        string[];
    }>(
      res.content,
      {
        leaning:
          "",

        argument:
          String(
            res.content,
          ),

        risks:
          [],

        decisionChangingFacts:
          [],
      },
    );

  const open =
    Array.from(
      new Set([
        ...state.open,

        ...parsed
          .decisionChangingFacts
          .filter(Boolean),
      ]),
    );

  await prisma.thread.update({
    where: {
      id:
        state.threadId,
    },

    data: {
      leaning:
        parsed.leaning,

      skepticArgument:
        parsed.argument,

      open,

      currentPass:
        "GROUND",
    },
  });

  const next:
    Partial<ShauriState> = {
    ...state,

    leaning:
      parsed.leaning,

    skepticArgument:
      parsed.argument,

    skepticRisks:
      parsed.risks,

    open,

    resumePass:
      "ground",
  };

  await checkpoint(
    {
      ...state,
      ...next,
    } as ShauriState,
    "SKEPTIC",
  );

  return next;
}


// ─────────────────────────────────────────────────────────────────────────────
// Grounding
// ─────────────────────────────────────────────────────────────────────────────

type TavilyResult = {
  url: string;
  title?: string;
  content?: string;
};

function extractTavily(
  raw: unknown,
): TavilyResult[] {
  if (
    Array.isArray(raw)
  ) {
    return raw as TavilyResult[];
  }

  try {
    const parsed =
      typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as Record<
            string,
            unknown
          >);

    if (
      Array.isArray(parsed)
    ) {
      return parsed as TavilyResult[];
    }

    if (
      parsed &&
      Array.isArray(
        parsed.results,
      )
    ) {
      return parsed.results as TavilyResult[];
    }

    return [];
  } catch {
    return [];
  }
}

async function ground(
  state: ShauriState,
): Promise<Partial<ShauriState>> {
  const claimsRes =
    await getModel().invoke([
      {
        role: "system",

        content: `
Extract only consequential factual claims or uncertainties that could materially change this decision and should be externally verified.

Return ONLY a JSON array of short claims.

If none, return [].
`.trim(),
      },

      {
        role: "user",

        content:
          JSON.stringify({
            known:
              state.known,

            open:
              state.open,

            skepticArgument:
              state.skepticArgument,

            risks:
              state.skepticRisks,
          }),
      },
    ]);

  const claims =
    json<string[]>(
      claimsRes.content,
      [],
    )
      .filter(Boolean)
      .slice(0, 5);

  if (
    !claims.length
  ) {
    await prisma.thread.update({
      where: {
        id:
          state.threadId,
      },

      data: {
        currentPass:
          "CLOSE",

        awaitingHuman:
          false,

        awaitingSource:
          "NONE",
      },
    });

    const next:
      Partial<ShauriState> = {
      ...state,

      groundingClaims:
        [],

      groundedFacts:
        [],

      awaitingHuman:
        false,

      awaitingSource:
        "NONE",

      resumePass:
        "close",
    };

    await checkpoint(
      {
        ...state,
        ...next,
      } as ShauriState,
      "GROUND",
    );

    return next;
  }

  const tavily =
    getTavily();

  const humanEvidence =
    state.known.filter(
      (k) =>
        String(k).startsWith(
          "Human-provided evidence:",
        ),
    );

  if (
    humanEvidence.length > 0
  ) {
    await prisma.thread.update({
      where: {
        id:
          state.threadId,
      },

      data: {
        currentPass:
          "CLOSE",

        awaitingHuman:
          false,

        awaitingSource:
          "NONE",
      },
    });

    const next:
      Partial<ShauriState> = {
      ...state,

      groundingClaims:
        claims,

      groundedFacts: [
        ...state.groundedFacts,

        ...humanEvidence.map(
          (e) => String(e),
        ),
      ],

      awaitingHuman:
        false,

      awaitingSource:
        "NONE",

      resumePass:
        "close",
    };

    await checkpoint(
      {
        ...state,
        ...next,
      } as ShauriState,
      "GROUND",
    );

    return next;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // External grounding unavailable
  // ──────────────────────────────────────────────────────────────────────────

  if (!tavily) {
    const primary =
      claims[0] ??
      "the key external claim";

    const need:
      InformationNeed = {
      question:
        `Can you verify this for the open matter?\n\n${primary}${
          claims.length > 1
            ? `\n\n(Also relevant: ${claims.slice(1, 3).join("; ")})`
            : ""
        }`,

      fact:
        claims.join("; "),

      factType:
        "EXTERNAL_FACT",

      preferredSource:
        "OPERATOR",

      required:
        true,

      reason:
        "External grounding is unavailable (no TAVILY_API_KEY). Operator verification required.",
    };

    const {
      q,
      source,
    } =
      await createRoutedHumanQuery(
        state,
        need,
        {
          fallbackFor:
            "EXTERNAL_FACT",
        },
      );

    await prisma.thread.update({
      where: {
        id:
          state.threadId,
      },

      data: {
        awaitingHuman:
          true,

        awaitingReply:
          false,

        awaitingSource:
          source,

        currentPass:
          "GROUND",
      },
    });

    const next:
      Partial<ShauriState> = {
      ...state,

      groundingClaims:
        claims,

      awaitingHuman:
        true,

      awaitingSource:
        source,

      awaitingReply:
        false,

      nextAction:
        q.question,

      resumePass:
        "ground",
    };

    await checkpoint(
      {
        ...state,
        ...next,
      } as ShauriState,
      "GROUND",
    );

    return next;
  }

  const evidence: Array<{
    claim: string;
    searchQuery: string;
    sourceUrl: string;
    sourceTitle?: string;
    finding: string;
    confidence?: number;
  }> = [];

  for (
    const claim of claims
  ) {
    const queryRes =
      await getFastModel().invoke([
        {
          role: "system",

          content:
            "Turn the claim into one precise web search query. Return only the query text.",
        },

        {
          role: "user",

          content:
            claim,
        },
      ]);

    const query =
      String(
        queryRes.content,
      ).trim();

    const raw =
      await tavily.invoke(
        query,
      );

    const results =
      extractTavily(raw)
        .slice(0, 5);

    for (
      const result of results
    ) {
      if (!result.url) {
        continue;
      }

      evidence.push({
        claim,

        searchQuery:
          query,

        sourceUrl:
          result.url,

        sourceTitle:
          result.title,

        finding:
          result.content || "",

        confidence:
          0.6,
      });
    }
  }

  if (
    !evidence.length
  ) {
    const need:
      InformationNeed = {
      question:
        `I couldn't establish reliable external evidence for: ${claims.join(
          "; ",
        )}. Do you have a source or local knowledge I should consider?`,

      fact:
        claims.join("; "),

      factType:
        "EXTERNAL_FACT",

      preferredSource:
        "OPERATOR",

      required:
        true,

      reason:
        "Grounding returned no usable evidence. Human input is required as a fallback.",
    };

    const {
      q,
      source,
    } =
      await createRoutedHumanQuery(
        state,
        need,
        {
          fallbackFor:
            "EXTERNAL_FACT",
        },
      );

    await prisma.thread.update({
      where: {
        id:
          state.threadId,
      },

      data: {
        awaitingHuman:
          true,

        awaitingReply:
          false,

        awaitingSource:
          source,

        currentPass:
          "GROUND",
      },
    });

    const next:
      Partial<ShauriState> = {
      ...state,

      groundingClaims:
        claims,

      awaitingHuman:
        true,

      awaitingSource:
        source,

      awaitingReply:
        false,

      nextAction:
        q.question,

      resumePass:
        "ground",
    };

    await checkpoint(
      {
        ...state,
        ...next,
      } as ShauriState,
      "GROUND",
    );

    return next;
  }

  await prisma.groundingEvidence.createMany({
    data:
      evidence.map(
        (e) => ({
          threadId:
            state.threadId,

          ...e,
        }),
      ),
  });

  const groundedFacts =
    evidence.map(
      (e) =>
        `${e.claim}: ${e.finding} [${
          e.sourceTitle ||
          e.sourceUrl
        }]`,
    );

  await prisma.thread.update({
    where: {
      id:
        state.threadId,
    },

    data: {
      currentPass:
        "CLOSE",

      awaitingHuman:
        false,

      awaitingSource:
        "NONE",
    },
  });

  const next:
    Partial<ShauriState> = {
    ...state,

    groundingClaims:
      claims,

    groundedFacts,

    awaitingHuman:
      false,

    awaitingSource:
      "NONE",

    resumePass:
      "close",
  };

  await checkpoint(
    {
      ...state,
      ...next,
    } as ShauriState,
    "GROUND",
  );

  return next;
}


// ─────────────────────────────────────────────────────────────────────────────
// Close
// ─────────────────────────────────────────────────────────────────────────────

async function closePass(
  state: ShauriState,
): Promise<Partial<ShauriState>> {
  const res =
    await getModel().invoke([
      {
        role: "system",

        content: `
You are Shauri Close — a calm decision coach for WhatsApp.

Write for the user in plain language (not an operator checklist).

Return ONLY JSON:
{
  "nextAction": "2–4 short sentences the user should see",
  "escalate": false,
  "resolved": false,
  "humanQuery": false,
  "decisionSummary": "one line internal summary"
}

Rules:

- Lines in known that start with "Human-provided evidence:" are already verified.
- Do NOT ask to re-verify them.
- Prefer one concrete next step.
- Do not dump numbered investigation lists unless necessary.
- Do not choose for the user.
- Set humanQuery=true only if a new fact is still missing.
- Set resolved=true only when the decision itself is settled.
- Escalate only for serious risk or hard limits.
`.trim(),
      },

      {
        role: "user",

        content:
          JSON.stringify({
            known:
              state.known.filter(
                (k) =>
                  !String(k).startsWith(
                    "Human-provided evidence:",
                  ),
              ),

            humanEvidence:
              state.known.filter(
                (k) =>
                  String(k).startsWith(
                    "Human-provided evidence:",
                  ),
              ),

            leaning:
              state.leaning,

            skeptic:
              state.skepticArgument,

            risks:
              state.skepticRisks,

            evidence:
              state.groundedFacts,

            input:
              state.rawInput,
          }),
      },
    ]);

  const parsed =
    json<{
      nextAction: string;
      escalate: boolean;
      resolved: boolean;
      humanQuery: boolean;
      decisionSummary: string;
    }>(
      res.content,
      {
        nextAction:
          String(
            res.content,
          ),

        escalate:
          false,

        resolved:
          false,

        humanQuery:
          false,

        decisionSummary:
          "",
      },
    );

  const decisionStatus =
    parsed.escalate
      ? DecisionRecordStatus.ESCALATED
      : parsed.humanQuery
        ? DecisionRecordStatus.AWAITING_HUMAN
        : DecisionRecordStatus.OPEN;

  const humanInputs =
    state.known.filter(
      (entry) =>
        String(entry).includes("User-provided answer:") ||
        String(entry).includes("Human-provided evidence:"),
    );

  await upsertDecisionRecord({
    userId: state.userId,
    threadId: state.threadId,
    matter: state.known.join("; ") || state.rawInput,
    status: decisionStatus,
    decisionSummary: parsed.decisionSummary || parsed.nextAction || state.rawInput,
    goal: state.rawInput,
    recommendedOption: parsed.nextAction,
    confidence: 0.7,
    risks: state.skepticRisks,
    assumptions: state.open,
    evidenceRefs: state.groundedFacts,
    humanInputs,
    escalationReason:
      parsed.escalate
        ? parsed.nextAction
        : null,
  });

  if (
    parsed.humanQuery
  ) {
    const need:
      InformationNeed = {
      question:
        parsed.nextAction,

      fact:
        parsed.nextAction,

      factType:
        "HUMAN_VERIFICATION",

      preferredSource:
        "OPERATOR",

      required:
        true,

      reason:
        "The closing pass determined that additional human information or judgment is required.",
    };

    const {
      q,
      source,
    } =
      await createRoutedHumanQuery(
        state,
        need,
      );

    await prisma.thread.update({
      where: {
        id:
          state.threadId,
      },

      data: {
        awaitingHuman:
          true,

        awaitingReply:
          false,

        awaitingSource:
          source,

        currentPass:
          "CLOSE",
      },
    });

    const next:
      Partial<ShauriState> = {
      ...state,

      awaitingHuman:
        true,

      awaitingSource:
        source,

      awaitingReply:
        false,

      nextAction:
        q.question,

      resumePass:
        "close",
    };

    await checkpoint(
      {
        ...state,
        ...next,
      } as ShauriState,
      "CLOSE",
    );

    return next;
  }

  if (
    parsed.escalate
  ) {
    const user =
      await prisma.user.findUniqueOrThrow({
        where: {
          id:
            state.userId,
        },
      });

    await notifyEscalation({
      threadId:
        state.threadId,

      userId:
        state.userId,

      userPhone:
        user.phone,

      reason:
        parsed.nextAction,
    });

    await prisma.thread.update({
      where: {
        id:
          state.threadId,
      },

      data: {
        status:
          "ESCALATED",

        currentPass:
          "CLOSE",

        awaitingReply:
          false,

        awaitingHuman:
          false,

        awaitingSource:
          "NONE",

        decisionSummary:
          parsed.decisionSummary ||
          undefined,
      },
    });

    await updateProfileFromThread(
      state.userId,
      state.threadId,
    );

    const next:
      Partial<ShauriState> = {
      ...state,

      status:
        "ESCALATED",

      nextAction:
        parsed.nextAction,

      awaitingHuman:
        false,

      awaitingSource:
        "NONE",

      resumePass:
        "close",
    };

    await checkpoint(
      {
        ...state,
        ...next,
      } as ShauriState,
      "CLOSE",
    );

    return next;
  }

  if (
    parsed.resolved
  ) {
    await prisma.thread.update({
      where: {
        id:
          state.threadId,
      },

      data: {
        pendingCloseConfirmation:
          true,

        awaitingReply:
          true,

        awaitingHuman:
          false,

        awaitingSource:
          "USER",

        currentPass:
          "CLOSE",

        decisionSummary:
          parsed.decisionSummary ||
          undefined,
      },
    });

    const next:
      Partial<ShauriState> = {
      ...state,

      pendingCloseConfirmation:
        true,

      awaitingReply:
        true,

      awaitingHuman:
        false,

      awaitingSource:
        "USER",

      nextAction:
        `${parsed.nextAction}\n\nThis sounds settled. Should I close this matter? (yes/no)`,
    };

    await checkpoint(
      {
        ...state,
        ...next,
      } as ShauriState,
      "CLOSE",
    );

    return next;
  }

  await createTask({
    userId:
      state.userId,

    threadId:
      state.threadId,

    description:
      parsed.nextAction,

    idempotencyKey:
      `close:${state.threadId}:${parsed.nextAction}`,
  });

  await scheduleFollowup({
    threadId:
      state.threadId,

    runAt:
      new Date(
        Date.now() +
          3 *
            24 *
            60 *
            60 *
            1000,
      ),

    promptContext:
      parsed.nextAction,
  });

  await prisma.thread.update({
    where: {
      id:
        state.threadId,
    },

    data: {
      currentPass:
        "CLOSE",

      awaitingReply:
        false,

      awaitingHuman:
        false,

      awaitingSource:
        "NONE",

      decisionSummary:
        parsed.decisionSummary ||
        undefined,
    },
  });

  const next:
    Partial<ShauriState> = {
    ...state,

    nextAction:
      parsed.nextAction,

    awaitingHuman:
      false,

    awaitingSource:
      "NONE",

    resumePass:
      "close",
  };

  await checkpoint(
    {
      ...state,
      ...next,
    } as ShauriState,
    "CLOSE",
  );

  return next;
}


// ─────────────────────────────────────────────────────────────────────────────
// Graph construction
// ─────────────────────────────────────────────────────────────────────────────

export function buildShauriGraph() {
  return new StateGraph(
    ShauriAnnotation,
  )

    .addNode(
      "dispatch",
      async (s) => s,
    )

    .addNode(
      "intake",
      intake,
    )

    .addNode(
      "skeptic",
      skeptic,
    )

    .addNode(
      "ground",
      ground,
    )

    .addNode(
      "close",
      closePass,
    )

    .addEdge(
      START,
      "dispatch",
    )

    .addConditionalEdges(
      "dispatch",
      (s) =>
        s.resumePass,
    )

    .addConditionalEdges(
      "intake",
      (s) => {
        if (
          s.awaitingSource ===
          "OPERATOR"
        ) {
          return END;
        }

        if (
          s.awaitingSource ===
            "USER" ||
          s.awaitingReply
        ) {
          return END;
        }

        return "skeptic";
      },
    )

    .addEdge(
      "skeptic",
      "ground",
    )

    .addConditionalEdges(
      "ground",
      (s) => {
        if (
          s.awaitingSource ===
          "OPERATOR"
        ) {
          return END;
        }

        if (
          s.awaitingHuman
        ) {
          return END;
        }

        return "close";
      },
    )

    .addEdge(
      "close",
      END,
    )

    .compile();
}


// ─────────────────────────────────────────────────────────────────────────────
// Close confirmation
// ─────────────────────────────────────────────────────────────────────────────

async function closeConfirmation(
  threadId: string,
  userId: string,
  text: string,
) {
  const yes =
    /^\s*(yes|yeah|yep|yup|sure|correct|done|close it|closed)\b/i.test(
      text,
    );

  if (!yes) {
    await prisma.thread.update({
      where: {
        id:
          threadId,
      },

      data: {
        pendingCloseConfirmation:
          false,

        awaitingReply:
          true,

        awaitingHuman:
          false,

        awaitingSource:
          "USER",

        currentPass:
          "INTAKE",
      },
    });

    await updateDecisionRecordStatus(
      threadId,
      DecisionRecordStatus.OPEN,
    );

    return {
      reply: formatDecisionReply(
        "No problem. What is still open about this?",
        {
          status: "OPEN",
          awaitingReply: true,
          awaitingHuman: false,
          awaitingSource: "USER",
          pendingCloseConfirmation: false,
        },
      ),

      awaitingReply:
        true,
    };
  }

  await threadState.transition(
    threadId,
    "close",
    "CLOSE",
  );

  await updateDecisionRecordStatus(
    threadId,
    DecisionRecordStatus.RESOLVED,
  );

  await updateProfileFromThread(
    userId,
    threadId,
  );

  return {
    reply: formatDecisionReply(
      "Closed out — the matter is marked settled.",
      {
        status: "CLOSED",
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: "NONE",
        pendingCloseConfirmation: false,
      },
    ),

    awaitingReply:
      false,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runShauriGraph(
  input: {
    threadId: string;
    userId: string;
    rawInput: string;
    injectedContext?: string;
  },
) {
  const thread =
    await prisma.thread.findUniqueOrThrow({
      where: {
        id:
          input.threadId,
      },
    });

  if (thread.outcomeRequestedAt) {
    await captureRequestedDecisionOutcome(
      thread.id,
      input.rawInput,
    );
  }

  await upsertDecisionRecord({
    userId:
      input.userId,
    threadId:
      input.threadId,
    matter:
      thread.decisionSummary ||
      thread.known.join("; ") ||
      input.rawInput,
    status:
      thread.status === "ESCALATED"
        ? DecisionRecordStatus.ESCALATED
        : thread.awaitingHuman
          ? DecisionRecordStatus.AWAITING_HUMAN
          : DecisionRecordStatus.OPEN,
    decisionSummary:
      thread.decisionSummary || "",
    goal:
      input.rawInput,
    recommendedOption:
      thread.decisionSummary || "",
    confidence:
      0,
    risks:
      thread.leaning ? [thread.leaning] : [],
    assumptions:
      thread.open,
    evidenceRefs:
      [],
    humanInputs:
      thread.known.filter(
        (entry) =>
          String(entry).includes("User-provided answer:") ||
          String(entry).includes("Human-provided evidence:"),
      ),
    escalationReason:
      thread.status === "ESCALATED"
        ? thread.decisionSummary || null
        : null,
  });


  // ──────────────────────────────────────────────────────────────────────────
  // Explicit close confirmation
  // ──────────────────────────────────────────────────────────────────────────

  if (
    thread.pendingCloseConfirmation
  ) {
    return closeConfirmation(
      input.threadId,
      input.userId,
      input.rawInput,
    );
  }


  // ──────────────────────────────────────────────────────────────────────────
  // HARD PAUSE: OPERATOR HumanQuery
  // ──────────────────────────────────────────────────────────────────────────
  //
  // An operator-owned HumanQuery is a hard lifecycle boundary.
  //
  // A normal user message must NEVER:
  //
  //   - answer it
  //   - clear awaitingHuman
  //   - clear awaitingSource
  //   - advance currentPass
  //   - rerun the graph
  //
  // The operator endpoint must answer the HumanQuery and explicitly
  // resume the graph.
  // ──────────────────────────────────────────────────────────────────────────

  if (
    thread.awaitingHuman &&
    thread.awaitingSource ===
      "OPERATOR"
  ) {
    const operatorQuery =
      await prisma.humanQuery.findFirst({
        where: {
          threadId:
            thread.id,

          status:
            "OPEN",

          source:
            "OPERATOR",
        },

        orderBy: {
          createdAt:
            "desc",
        },
      });

    if (
      operatorQuery
    ) {
      return {
        reply: formatDecisionReply(
          operatorQuery.question,
          {
            status: thread.status,
            awaitingReply: true,
            awaitingHuman: true,
            awaitingSource: "OPERATOR",
            pendingCloseConfirmation: false,
          },
        ),

        awaitingReply:
          true,
      };
    }

    return {
      reply: formatDecisionReply(
        "I'm still waiting for the human information needed to continue this matter.",
        {
          status: thread.status,
          awaitingReply: true,
          awaitingHuman: true,
          awaitingSource: "OPERATOR",
          pendingCloseConfirmation: false,
        },
      ),

      awaitingReply:
        true,
    };
  }


  // ──────────────────────────────────────────────────────────────────────────
  // USER HumanQuery handling
  // ──────────────────────────────────────────────────────────────────────────
  //
  // IMPORTANT FIX:
  //
  // We preserve the pass that created the HumanQuery.
  //
  // Previously this code always did:
  //
  //   currentPass = "INTAKE"
  //
  // That is incorrect when the question originated from GROUND
  // or CLOSE.
  //
  // Example:
  //
  //   GROUND
  //      ↓
  //   "What is the salary?"
  //      ↓
  //   user answers
  //      ↓
  //   must resume GROUND
  //
  // not:
  //
  //   user answers
  //      ↓
  //   restart INTAKE
  //
  // We therefore capture the persisted pass BEFORE clearing the
  // HumanQuery state.
  // ──────────────────────────────────────────────────────────────────────────

  let rawInput =
    input.rawInput;

  let known =
    thread.known;

  let resumePassFromHumanQuery:
    ShauriState["resumePass"] | null =
    null;

  if (
    thread.awaitingHuman
  ) {
    const q =
      await prisma.humanQuery.findFirst({
        where: {
          threadId:
            thread.id,

          status:
            "OPEN",
        },

        orderBy: {
          createdAt:
            "desc",
        },
      });

    if (q) {
      const source =
        q.source === "OPERATOR"
          ? "OPERATOR"
          : "USER";

      /**
       * Defensive operator guard.
       *
       * This should normally have been caught by the hard pause
       * above, but keep the protection here as a second boundary.
       */
      if (
        source === "OPERATOR"
      ) {
        return {
          reply: formatDecisionReply(
            q.question,
            {
              status: thread.status,
              awaitingReply: true,
              awaitingHuman: true,
              awaitingSource: "OPERATOR",
              pendingCloseConfirmation: false,
            },
          ),

          awaitingReply:
            true,
        };
      }

      /*
       * Capture the pass BEFORE mutating the thread.
       */
      const persistedPass =
        thread.currentPass.toLowerCase();

      const validPasses:
        ShauriState["resumePass"][] = [
        "intake",
        "skeptic",
        "ground",
        "close",
      ];

      if (
        validPasses.includes(
          persistedPass as ShauriState["resumePass"],
        )
      ) {
        resumePassFromHumanQuery =
          persistedPass as ShauriState["resumePass"];
      } else {
        resumePassFromHumanQuery =
          "intake";
      }

      /*
       * The user's message answers the open HumanQuery.
       *
       * answerHumanQuery owns the HumanQuery lifecycle.
       */
      await answerHumanQuery(
        q.id,
        input.rawInput,
      );

      /*
       * Preserve the answer in the thread's durable knowledge.
       *
       * This is intentionally different from rawInput:
       *
       * rawInput = the current WhatsApp message
       * known    = durable information discovered throughout the matter
       */
      known = [
        ...thread.known,

        `User-provided answer: ${input.rawInput}`,
      ];

      await prisma.thread.update({
        where: {
          id:
            thread.id,
        },

        data: {
          awaitingHuman:
            false,

          awaitingReply:
            false,

          awaitingSource:
            "NONE",

          /*
           * Resume the pass that originally asked the question.
           */
          currentPass:
            resumePassFromHumanQuery ===
            "intake"
              ? "INTAKE"
              : resumePassFromHumanQuery ===
                "skeptic"
              ? "SKEPTIC"
              : resumePassFromHumanQuery ===
                "ground"
              ? "GROUND"
              : "CLOSE",

          known,
        },
      });
    }
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Rehydrate an in-progress USER clarification
  // ──────────────────────────────────────────────────────────────────────────
  //
  // This applies to the ordinary "awaitingReply" flow, not a HumanQuery.
  // ──────────────────────────────────────────────────────────────────────────

  if (
    thread.currentPass ===
      "INTAKE" &&
    thread.awaitingReply &&
    !thread.awaitingHuman
  ) {
    rawInput =
      `Prior known facts: ${known.join("; ")}
Outstanding question: ${
        thread.open.at(-1) || ""
      }
User response: ${input.rawInput}`;
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Build graph state
  // ──────────────────────────────────────────────────────────────────────────

  const validPasses:
    ShauriState["resumePass"][] = [
    "intake",
    "skeptic",
    "ground",
    "close",
  ];

  /*
   * If a USER HumanQuery was just answered, use the captured pass.
   *
   * Otherwise derive the resume point from persisted thread state.
   */
  const persistedPass =
    resumePassFromHumanQuery ??
    thread.currentPass.toLowerCase();

  const resumePass =
    validPasses.includes(
      persistedPass as ShauriState["resumePass"],
    )
      ? persistedPass as ShauriState["resumePass"]
      : "intake";


  // ──────────────────────────────────────────────────────────────────────────
  // Build state
  // ──────────────────────────────────────────────────────────────────────────

  const state:
    ShauriState = {
    threadId:
      input.threadId,

    userId:
      input.userId,

    rawInput,

    known,

    open:
      thread.open,

    informationNeeds:
      [],

    leaning:
      thread.leaning,

    skepticArgument:
      thread.skepticArgument,

    skepticRisks:
      [],

    groundedFacts:
      [],

    groundingClaims:
      [],

    status:
      thread.status,

    nextAction:
      null,

    awaitingReply:
      false,

    awaitingHuman:
      false,

    awaitingSource:
      "NONE",

    pendingCloseConfirmation:
      false,

    injectedContext:
      input.injectedContext,

    resumePass,
  };


  // ──────────────────────────────────────────────────────────────────────────
  // Execute graph
  // ──────────────────────────────────────────────────────────────────────────

  const graph =
    buildShauriGraph();

  const result =
    await graph.invoke(
      state,
      {
        configurable: {
          thread_id:
            input.threadId,
        },

        metadata: {
          shauriThreadId:
            input.threadId,

          userId:
            input.userId,
        },

        tags: [
          "shauri",
          "decision-engine",
        ],
      },
    );

  const finalState =
    result as ShauriState;


  // ──────────────────────────────────────────────────────────────────────────
  // Return user-facing result
  // ──────────────────────────────────────────────────────────────────────────

  return {
    reply: formatDecisionReply(
      finalState.nextAction ||
        "I have updated the matter. What would you like to do next?",
      {
        status: finalState.status,
        awaitingReply: Boolean(finalState.awaitingReply),
        awaitingHuman: Boolean(finalState.awaitingHuman),
        awaitingSource: finalState.awaitingSource,
        pendingCloseConfirmation: Boolean(
          finalState.pendingCloseConfirmation,
        ),
      },
    ),

    awaitingReply:
      Boolean(
        finalState.awaitingReply ||
        finalState.awaitingHuman ||
        finalState.awaitingSource !==
          "NONE",
      ),
  };
}
