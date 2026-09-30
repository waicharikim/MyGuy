"use strict";
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
 * EXTERNAL
 *      → externally verifiable facts. Tavily is preferred.
 *
 * SYSTEM
 *      → facts already available from Shauri/application state.
 *
 * Important:
 *
 * - The graph decides WHEN information is missing.
 * - human-routing.ts decides WHO should provide human information.
 * - human-query.ts owns HumanQuery persistence and lifecycle.
 * - Operator answers resume the graph through the operator endpoint.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShauriGraph = buildShauriGraph;
exports.runShauriGraph = runShauriGraph;
const langgraph_1 = require("@langchain/langgraph");
const tavily_search_1 = require("@langchain/community/tools/tavily_search");
const model_1 = require("./model");
const prisma_1 = require("../infrastructure/prisma");
const thread_1 = require("../domain/thread");
const create_task_1 = require("../tools/create_task");
const schedule_followup_1 = require("../tools/schedule_followup");
const human_query_1 = require("./human-query");
const escalation_1 = require("./escalation");
const profile_1 = require("./profile");
const human_routing_1 = require("./human-routing");
/**
 * Fact-type routing provides the deterministic baseline.
 *
 * human-routing.ts is then used for information that genuinely needs
 * human authority.
 */
const informationSourceByFactType = {
    USER_INTENT: "USER",
    USER_PREFERENCE: "USER",
    USER_EXPERIENCE: "USER",
    SYSTEM_STATE: "SYSTEM",
    POLICY: "SYSTEM",
    ORGANIZATIONAL_KNOWLEDGE: "OPERATOR",
    HUMAN_VERIFICATION: "OPERATOR",
    EXTERNAL_FACT: "EXTERNAL",
};
/**
 * Resolve the deterministic source implied by the fact type.
 */
function resolveInformationSource(need) {
    return (informationSourceByFactType[need.factType] ??
        need.preferredSource);
}
/**
 * Determine whether this information need requires a human authority.
 *
 * SYSTEM and EXTERNAL information have their own resolution paths.
 *
 * USER and OPERATOR are routed through human-routing.ts.
 */
function requiresHumanRouting(need) {
    const source = resolveInformationSource(need);
    return (source === "USER" ||
        source === "OPERATOR");
}
/**
 * Ask the dedicated human-routing agent to determine the authoritative
 * human source.
 *
 * The fact type remains useful context.
 *
 * The router determines USER vs OPERATOR.
 */
async function routeHumanInformationNeed(state, need) {
    const source = resolveInformationSource(need);
    return (0, human_routing_1.determineHumanQuerySource)({
        matter: state.known.join("; "),
        question: need.question ||
            need.fact ||
            "What information is missing?",
        reason: need.reason ||
            "Additional human information is required.",
        known: state.known,
        open: state.open,
        authorityHint: source === "USER" ||
            source === "OPERATOR"
            ? source
            : "NONE",
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Typed graph state
// ─────────────────────────────────────────────────────────────────────────────
const ShauriAnnotation = langgraph_1.Annotation.Root({
    threadId: (langgraph_1.Annotation),
    userId: (langgraph_1.Annotation),
    rawInput: (langgraph_1.Annotation),
    known: (langgraph_1.Annotation),
    open: (langgraph_1.Annotation),
    informationNeeds: (langgraph_1.Annotation),
    leaning: (langgraph_1.Annotation),
    skepticArgument: (langgraph_1.Annotation),
    skepticRisks: (langgraph_1.Annotation),
    groundedFacts: (langgraph_1.Annotation),
    groundingClaims: (langgraph_1.Annotation),
    status: (langgraph_1.Annotation),
    nextAction: (langgraph_1.Annotation),
    awaitingReply: (langgraph_1.Annotation),
    /**
     * Compatibility with persisted Thread model.
     */
    awaitingHuman: (langgraph_1.Annotation),
    /**
     * Explicit authority for the next human-provided information.
     */
    awaitingSource: (langgraph_1.Annotation),
    pendingCloseConfirmation: (langgraph_1.Annotation),
    injectedContext: (langgraph_1.Annotation),
    resumePass: (langgraph_1.Annotation),
});
// ─────────────────────────────────────────────────────────────────────────────
// Models and tools
// ─────────────────────────────────────────────────────────────────────────────
const getModel = () => (0, model_1.getChatModel)(0.25);
const getFastModel = () => (0, model_1.getChatModel)(0);
/**
 * Tavily is optional.
 *
 * If unavailable, grounding falls back to a HumanQuery.
 */
const getTavily = () => process.env.TAVILY_API_KEY
    ? new tavily_search_1.TavilySearchResults({
        maxResults: 5,
    })
    : null;
// ─────────────────────────────────────────────────────────────────────────────
// JSON helpers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Remove markdown JSON fences.
 */
function stripFences(raw) {
    let s = String(raw ?? "").trim();
    if (s.startsWith("```")) {
        s =
            s
                .replace(/^```(?:json|JSON)?\s*/i, "")
                .replace(/\s*```$/i, "");
    }
    return s.trim();
}
/**
 * Defensive JSON parser.
 */
function json(value, fallback) {
    try {
        return JSON.parse(stripFences(value));
    }
    catch {
        return fallback;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Checkpoint
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Persist an application-level checkpoint after every pass.
 */
async function checkpoint(state, pass) {
    await prisma_1.prisma.graphCheckpoint.create({
        data: {
            threadId: state.threadId,
            graphThreadId: state.threadId,
            pass,
            state: JSON.parse(JSON.stringify(state)),
        },
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// HumanQuery integration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Create a HumanQuery after routing the information requirement.
 *
 * Flow:
 *
 *   graph
 *      ↓
 *   human-routing
 *      ↓
 *   USER / OPERATOR
 *      ↓
 *   human-query
 *      ↓
 *   persisted HumanQuery
 *      ↓
 *   thread pauses
 */
async function createRoutedHumanQuery(state, need, options) {
    const routing = await routeHumanInformationNeed(state, need);
    const source = routing.source;
    const knownContext = JSON.stringify({
        known: state.known,
        open: state.open,
        informationNeed: need,
        routing: {
            source,
            reason: routing.reason,
            confidence: routing.confidence,
        },
        ...(options?.fallbackFor
            ? {
                fallbackFor: options.fallbackFor,
            }
            : {}),
    });
    const q = await (0, human_query_1.createHumanQuery)({
        userId: state.userId,
        threadId: state.threadId,
        matter: state.known.join("; "),
        question: need.question ||
            need.fact ||
            "What information is missing?",
        knownContext,
        reason: routing.reason ||
            need.reason ||
            "Additional human information is required.",
        source,
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
async function intake(state) {
    const profile = await (0, profile_1.getProfileSnapshot)(state.userId);
    const res = await getModel().invoke([
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

${state.injectedContext
                ? `
Existing context:

${state.injectedContext}
`
                : ""}

${profile
                ? `
User profile:

${JSON.stringify(profile)}
`
                : ""}
`.trim(),
        },
        {
            role: "user",
            content: state.rawInput,
        },
    ]);
    const parsed = json(res.content, {
        needsClarification: true,
        question: String(res.content),
        known: state.known,
        open: state.open,
        decisionSummary: "",
        informationNeeds: [],
    });
    const known = Array.isArray(parsed.known)
        ? parsed.known.filter(Boolean)
        : state.known;
    const open = Array.isArray(parsed.open)
        ? parsed.open.filter(Boolean)
        : state.open;
    const informationNeeds = Array.isArray(parsed.informationNeeds)
        ? parsed.informationNeeds
            .filter(Boolean)
            .map((need) => ({
            ...need,
            preferredSource: resolveInformationSource(need),
        }))
        : [];
    // ──────────────────────────────────────────────────────────────────────────
    // Required human information
    // ──────────────────────────────────────────────────────────────────────────
    const requiredHumanNeeds = informationNeeds.filter((need) => need.required &&
        requiresHumanRouting(need));
    /**
     * Lifecycle deliberately remains one-question-at-a-time.
     */
    if (requiredHumanNeeds.length > 0) {
        const first = requiredHumanNeeds[0];
        const { q, source, } = await createRoutedHumanQuery(state, first);
        // ────────────────────────────────────────────────────────────────────────
        // USER authority
        // ────────────────────────────────────────────────────────────────────────
        if (source === "USER") {
            await prisma_1.prisma.thread.update({
                where: {
                    id: state.threadId,
                },
                data: {
                    known,
                    open: Array.from(new Set([
                        ...open,
                        q.question,
                    ])),
                    currentPass: "INTAKE",
                    awaitingReply: false,
                    awaitingHuman: true,
                    awaitingSource: "USER",
                    decisionSummary: parsed.decisionSummary ||
                        undefined,
                },
            });
            const next = {
                ...state,
                known,
                open,
                informationNeeds,
                awaitingHuman: true,
                awaitingSource: "USER",
                awaitingReply: false,
                nextAction: q.question,
                resumePass: "intake",
            };
            await checkpoint({
                ...state,
                ...next,
            }, "INTAKE");
            return next;
        }
        // ────────────────────────────────────────────────────────────────────────
        // OPERATOR authority
        // ────────────────────────────────────────────────────────────────────────
        if (source === "OPERATOR") {
            await prisma_1.prisma.thread.update({
                where: {
                    id: state.threadId,
                },
                data: {
                    known,
                    open: Array.from(new Set([
                        ...open,
                        q.question,
                    ])),
                    currentPass: "INTAKE",
                    awaitingReply: false,
                    awaitingHuman: true,
                    awaitingSource: "OPERATOR",
                    decisionSummary: parsed.decisionSummary ||
                        undefined,
                },
            });
            const next = {
                ...state,
                known,
                open,
                informationNeeds,
                awaitingHuman: true,
                awaitingSource: "OPERATOR",
                awaitingReply: false,
                nextAction: q.question,
                resumePass: "intake",
            };
            await checkpoint({
                ...state,
                ...next,
            }, "INTAKE");
            return next;
        }
    }
    // ──────────────────────────────────────────────────────────────────────────
    // No human query
    // ──────────────────────────────────────────────────────────────────────────
    await prisma_1.prisma.thread.update({
        where: {
            id: state.threadId,
        },
        data: {
            known,
            open,
            currentPass: "SKEPTIC",
            awaitingReply: false,
            awaitingHuman: false,
            awaitingSource: "NONE",
            decisionSummary: parsed.decisionSummary ||
                undefined,
        },
    });
    const next = {
        ...state,
        known,
        open,
        informationNeeds,
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: "NONE",
        nextAction: null,
        resumePass: "skeptic",
    };
    await checkpoint({
        ...state,
        ...next,
    }, "INTAKE");
    return next;
}
// ─────────────────────────────────────────────────────────────────────────────
// Skeptic
// ─────────────────────────────────────────────────────────────────────────────
async function skeptic(state) {
    const res = await getModel().invoke([
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
            content: JSON.stringify({
                known: state.known,
                open: state.open,
            }),
        },
    ]);
    const parsed = json(res.content, {
        leaning: "",
        argument: String(res.content),
        risks: [],
        decisionChangingFacts: [],
    });
    const open = Array.from(new Set([
        ...state.open,
        ...parsed
            .decisionChangingFacts
            .filter(Boolean),
    ]));
    await prisma_1.prisma.thread.update({
        where: {
            id: state.threadId,
        },
        data: {
            leaning: parsed.leaning,
            skepticArgument: parsed.argument,
            open,
            currentPass: "GROUND",
        },
    });
    const next = {
        ...state,
        leaning: parsed.leaning,
        skepticArgument: parsed.argument,
        skepticRisks: parsed.risks,
        open,
        resumePass: "ground",
    };
    await checkpoint({
        ...state,
        ...next,
    }, "SKEPTIC");
    return next;
}
/**
 * Normalize Tavily output.
 */
function extractTavily(raw) {
    if (Array.isArray(raw)) {
        return raw;
    }
    try {
        const parsed = typeof raw === "string"
            ? JSON.parse(raw)
            : raw;
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed &&
            Array.isArray(parsed.results)) {
            return parsed.results;
        }
        return [];
    }
    catch {
        return [];
    }
}
async function ground(state) {
    const claimsRes = await getModel().invoke([
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
            content: JSON.stringify({
                known: state.known,
                open: state.open,
                skepticArgument: state.skepticArgument,
                risks: state.skepticRisks,
            }),
        },
    ]);
    const claims = json(claimsRes.content, [])
        .filter(Boolean)
        .slice(0, 5);
    // ──────────────────────────────────────────────────────────────────────────
    // No external claims
    // ──────────────────────────────────────────────────────────────────────────
    if (!claims.length) {
        await prisma_1.prisma.thread.update({
            where: {
                id: state.threadId,
            },
            data: {
                currentPass: "CLOSE",
                awaitingHuman: false,
                awaitingSource: "NONE",
            },
        });
        const next = {
            ...state,
            groundingClaims: [],
            groundedFacts: [],
            awaitingHuman: false,
            awaitingSource: "NONE",
            resumePass: "close",
        };
        await checkpoint({
            ...state,
            ...next,
        }, "GROUND");
        return next;
    }
    const tavily = getTavily();
    // ──────────────────────────────────────────────────────────────────────────
    // External grounding unavailable
    //
    // IMPORTANT:
    //
    // The graph knows that external evidence is unavailable.
    // It therefore creates a human information requirement.
    //
    // human-routing.ts decides whether USER or OPERATOR is authoritative.
    // ──────────────────────────────────────────────────────────────────────────
    if (!tavily) {
        const need = {
            question: `I need reliable evidence for these claims before I can close this safely: ${claims.join("; ")}.`,
            fact: claims.join("; "),
            factType: "EXTERNAL_FACT",
            preferredSource: "OPERATOR",
            required: true,
            reason: "External grounding is unavailable because TAVILY_API_KEY is not configured. Human fallback is required.",
        };
        const { q, source, } = await createRoutedHumanQuery(state, need, {
            fallbackFor: "EXTERNAL_FACT",
        });
        await prisma_1.prisma.thread.update({
            where: {
                id: state.threadId,
            },
            data: {
                awaitingHuman: true,
                awaitingReply: false,
                awaitingSource: source,
                currentPass: "GROUND",
            },
        });
        const next = {
            ...state,
            groundingClaims: claims,
            awaitingHuman: true,
            awaitingSource: source,
            awaitingReply: false,
            nextAction: q.question,
            resumePass: "ground",
        };
        await checkpoint({
            ...state,
            ...next,
        }, "GROUND");
        return next;
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Search each claim
    // ──────────────────────────────────────────────────────────────────────────
    const evidence = [];
    for (const claim of claims) {
        const queryRes = await getFastModel().invoke([
            {
                role: "system",
                content: "Turn the claim into one precise web search query. Return only the query text.",
            },
            {
                role: "user",
                content: claim,
            },
        ]);
        const query = String(queryRes.content).trim();
        const raw = await tavily.invoke(query);
        const results = extractTavily(raw)
            .slice(0, 5);
        for (const result of results) {
            if (!result.url) {
                continue;
            }
            evidence.push({
                claim,
                searchQuery: query,
                sourceUrl: result.url,
                sourceTitle: result.title,
                finding: result.content || "",
                confidence: 0.6,
            });
        }
    }
    // ──────────────────────────────────────────────────────────────────────────
    // No usable evidence
    // ──────────────────────────────────────────────────────────────────────────
    if (!evidence.length) {
        const need = {
            question: `I couldn't establish reliable external evidence for: ${claims.join("; ")}. Do you have a source or local knowledge I should consider?`,
            fact: claims.join("; "),
            factType: "EXTERNAL_FACT",
            preferredSource: "OPERATOR",
            required: true,
            reason: "Grounding returned no usable evidence. Human input is required as a fallback.",
        };
        const { q, source, } = await createRoutedHumanQuery(state, need, {
            fallbackFor: "EXTERNAL_FACT",
        });
        await prisma_1.prisma.thread.update({
            where: {
                id: state.threadId,
            },
            data: {
                awaitingHuman: true,
                awaitingReply: false,
                awaitingSource: source,
                currentPass: "GROUND",
            },
        });
        const next = {
            ...state,
            groundingClaims: claims,
            awaitingHuman: true,
            awaitingSource: source,
            awaitingReply: false,
            nextAction: q.question,
            resumePass: "ground",
        };
        await checkpoint({
            ...state,
            ...next,
        }, "GROUND");
        return next;
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Persist evidence
    // ──────────────────────────────────────────────────────────────────────────
    await prisma_1.prisma.groundingEvidence.createMany({
        data: evidence.map((e) => ({
            threadId: state.threadId,
            ...e,
        })),
    });
    const groundedFacts = evidence.map((e) => `${e.claim}: ${e.finding} [${e.sourceTitle ||
        e.sourceUrl}]`);
    await prisma_1.prisma.thread.update({
        where: {
            id: state.threadId,
        },
        data: {
            currentPass: "CLOSE",
            awaitingHuman: false,
            awaitingSource: "NONE",
        },
    });
    const next = {
        ...state,
        groundingClaims: claims,
        groundedFacts,
        awaitingHuman: false,
        awaitingSource: "NONE",
        resumePass: "close",
    };
    await checkpoint({
        ...state,
        ...next,
    }, "GROUND");
    return next;
}
// ─────────────────────────────────────────────────────────────────────────────
// Close
// ─────────────────────────────────────────────────────────────────────────────
async function closePass(state) {
    const res = await getModel().invoke([
        {
            role: "system",
            content: `
You are Shauri Close.

Synthesize decision support without choosing for the user.

Return ONLY JSON:

{
  "nextAction": "one concrete next step",
  "escalate": false,
  "resolved": false,
  "humanQuery": false,
  "decisionSummary": ""
}

Escalate when the matter needs a human because of risk or limits.

Set resolved only when the matter itself appears settled,
not merely because one task is done.

Set humanQuery=true when additional human information or
human judgment is genuinely required.
`.trim(),
        },
        {
            role: "user",
            content: JSON.stringify({
                known: state.known,
                leaning: state.leaning,
                skeptic: state.skepticArgument,
                risks: state.skepticRisks,
                evidence: state.groundedFacts,
                input: state.rawInput,
            }),
        },
    ]);
    const parsed = json(res.content, {
        nextAction: String(res.content),
        escalate: false,
        resolved: false,
        humanQuery: false,
        decisionSummary: "",
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Close requests human information/judgment
    // ──────────────────────────────────────────────────────────────────────────
    if (parsed.humanQuery) {
        const need = {
            question: parsed.nextAction,
            fact: parsed.nextAction,
            factType: "HUMAN_VERIFICATION",
            preferredSource: "OPERATOR",
            required: true,
            reason: "The closing pass determined that additional human information or judgment is required.",
        };
        const { q, source, } = await createRoutedHumanQuery(state, need);
        await prisma_1.prisma.thread.update({
            where: {
                id: state.threadId,
            },
            data: {
                awaitingHuman: true,
                awaitingReply: false,
                awaitingSource: source,
                currentPass: "CLOSE",
            },
        });
        const next = {
            ...state,
            awaitingHuman: true,
            awaitingSource: source,
            awaitingReply: false,
            nextAction: q.question,
            resumePass: "close",
        };
        await checkpoint({
            ...state,
            ...next,
        }, "CLOSE");
        return next;
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Escalation
    // ──────────────────────────────────────────────────────────────────────────
    if (parsed.escalate) {
        const user = await prisma_1.prisma.user.findUniqueOrThrow({
            where: {
                id: state.userId,
            },
        });
        await (0, escalation_1.notifyEscalation)({
            threadId: state.threadId,
            userId: state.userId,
            userPhone: user.phone,
            reason: parsed.nextAction,
        });
        await prisma_1.prisma.thread.update({
            where: {
                id: state.threadId,
            },
            data: {
                status: "ESCALATED",
                currentPass: "CLOSE",
                awaitingReply: false,
                awaitingHuman: false,
                awaitingSource: "NONE",
                decisionSummary: parsed.decisionSummary ||
                    undefined,
            },
        });
        await (0, profile_1.updateProfileFromThread)(state.userId, state.threadId);
        const next = {
            ...state,
            status: "ESCALATED",
            nextAction: parsed.nextAction,
            awaitingHuman: false,
            awaitingSource: "NONE",
            resumePass: "close",
        };
        await checkpoint({
            ...state,
            ...next,
        }, "CLOSE");
        return next;
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Proposed resolution
    //
    // User must explicitly confirm closure.
    // ──────────────────────────────────────────────────────────────────────────
    if (parsed.resolved) {
        await prisma_1.prisma.thread.update({
            where: {
                id: state.threadId,
            },
            data: {
                pendingCloseConfirmation: true,
                awaitingReply: true,
                awaitingHuman: false,
                awaitingSource: "USER",
                currentPass: "CLOSE",
                decisionSummary: parsed.decisionSummary ||
                    undefined,
            },
        });
        const next = {
            ...state,
            pendingCloseConfirmation: true,
            awaitingReply: true,
            awaitingHuman: false,
            awaitingSource: "USER",
            nextAction: `${parsed.nextAction}\n\nThis sounds settled. Should I close this matter? (yes/no)`,
        };
        await checkpoint({
            ...state,
            ...next,
        }, "CLOSE");
        return next;
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Ordinary next action
    // ──────────────────────────────────────────────────────────────────────────
    await (0, create_task_1.createTask)({
        userId: state.userId,
        threadId: state.threadId,
        description: parsed.nextAction,
        idempotencyKey: `close:${state.threadId}:${parsed.nextAction}`,
    });
    await (0, schedule_followup_1.scheduleFollowup)({
        threadId: state.threadId,
        runAt: new Date(Date.now() +
            3 *
                24 *
                60 *
                60 *
                1000),
        promptContext: parsed.nextAction,
    });
    await prisma_1.prisma.thread.update({
        where: {
            id: state.threadId,
        },
        data: {
            currentPass: "CLOSE",
            awaitingReply: false,
            awaitingHuman: false,
            awaitingSource: "NONE",
            decisionSummary: parsed.decisionSummary ||
                undefined,
        },
    });
    const next = {
        ...state,
        nextAction: parsed.nextAction,
        awaitingHuman: false,
        awaitingSource: "NONE",
        resumePass: "close",
    };
    await checkpoint({
        ...state,
        ...next,
    }, "CLOSE");
    return next;
}
// ─────────────────────────────────────────────────────────────────────────────
// Graph construction
// ─────────────────────────────────────────────────────────────────────────────
function buildShauriGraph() {
    return new langgraph_1.StateGraph(ShauriAnnotation)
        .addNode("dispatch", async (s) => s)
        .addNode("intake", intake)
        .addNode("skeptic", skeptic)
        .addNode("ground", ground)
        .addNode("close", closePass)
        .addEdge(langgraph_1.START, "dispatch")
        .addConditionalEdges("dispatch", (s) => s.resumePass)
        .addConditionalEdges("intake", (s) => {
        /**
         * OPERATOR is authoritative.
         *
         * The graph must stop here.
         * The operator endpoint will resume it later.
         */
        if (s.awaitingSource ===
            "OPERATOR") {
            return langgraph_1.END;
        }
        /**
         * USER clarification also pauses the graph.
         */
        if (s.awaitingSource ===
            "USER" ||
            s.awaitingReply) {
            return langgraph_1.END;
        }
        return "skeptic";
    })
        .addEdge("skeptic", "ground")
        .addConditionalEdges("ground", (s) => {
        /**
         * Operator-owned HumanQuery.
         *
         * Never continue without the operator answer.
         */
        if (s.awaitingSource ===
            "OPERATOR") {
            return langgraph_1.END;
        }
        /**
         * Any other human wait also pauses.
         */
        if (s.awaitingHuman) {
            return langgraph_1.END;
        }
        return "close";
    })
        .addEdge("close", langgraph_1.END)
        .compile();
}
// ─────────────────────────────────────────────────────────────────────────────
// Close confirmation
// ─────────────────────────────────────────────────────────────────────────────
async function closeConfirmation(threadId, userId, text) {
    const yes = /^\s*(yes|yeah|yep|yup|sure|correct|done|close it|closed)\b/i.test(text);
    if (!yes) {
        await prisma_1.prisma.thread.update({
            where: {
                id: threadId,
            },
            data: {
                pendingCloseConfirmation: false,
                awaitingReply: true,
                awaitingHuman: false,
                awaitingSource: "USER",
                currentPass: "INTAKE",
            },
        });
        return {
            reply: "No problem. What is still open about this?",
            awaitingReply: true,
        };
    }
    await thread_1.threadState.transition(threadId, "close", "CLOSE");
    await (0, profile_1.updateProfileFromThread)(userId, threadId);
    return {
        reply: "Closed out — the matter is marked settled.",
        awaitingReply: false,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────
async function runShauriGraph(input) {
    const thread = await prisma_1.prisma.thread.findUniqueOrThrow({
        where: {
            id: input.threadId,
        },
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Explicit close confirmation
    // ──────────────────────────────────────────────────────────────────────────
    if (thread.pendingCloseConfirmation) {
        return closeConfirmation(input.threadId, input.userId, input.rawInput);
    }
    let rawInput = input.rawInput;
    let known = thread.known;
    // ──────────────────────────────────────────────────────────────────────────
    // HumanQuery handling
    //
    // USER:
    //   inbound WhatsApp message can answer it.
    //
    // OPERATOR:
    //   inbound WhatsApp message must NOT answer it.
    //   Operator endpoint owns the answer.
    // ──────────────────────────────────────────────────────────────────────────
    if (thread.awaitingHuman) {
        const q = await prisma_1.prisma.humanQuery.findFirst({
            where: {
                threadId: thread.id,
                status: "OPEN",
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        if (q) {
            /**
             * HumanQuery.source is authoritative.
             */
            const source = q.source === "OPERATOR"
                ? "OPERATOR"
                : "USER";
            // ──────────────────────────────────────────────────────────────────────
            // USER-owned HumanQuery
            // ──────────────────────────────────────────────────────────────────────
            if (source === "USER") {
                await (0, human_query_1.answerHumanQuery)(q.id, input.rawInput);
                known = [
                    ...thread.known,
                    `User-provided answer: ${input.rawInput}`,
                ];
                await prisma_1.prisma.thread.update({
                    where: {
                        id: thread.id,
                    },
                    data: {
                        awaitingHuman: false,
                        awaitingReply: false,
                        awaitingSource: "NONE",
                        currentPass: "INTAKE",
                        known,
                    },
                });
            }
            // ──────────────────────────────────────────────────────────────────────
            // OPERATOR-owned HumanQuery
            // ──────────────────────────────────────────────────────────────────────
            //
            // IMPORTANT:
            //
            // We deliberately do NOTHING here.
            //
            // The incoming user message does not answer the operator query.
            //
            // The operator endpoint:
            //
            //   resumeHumanQueryFromOperator(...)
            //
            // owns that lifecycle.
            //
            // This prevents a normal user WhatsApp message from accidentally
            // satisfying an operator-authoritative query.
            //
        }
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Rehydrate an in-progress USER clarification
    // ──────────────────────────────────────────────────────────────────────────
    if (thread.currentPass ===
        "INTAKE" &&
        thread.awaitingReply &&
        !thread.awaitingHuman) {
        rawInput =
            `Prior known facts: ${known.join("; ")}
Outstanding question: ${thread.open.at(-1) || ""}
User response: ${input.rawInput}`;
    }
    // ──────────────────────────────────────────────────────────────────────────
    // Build graph state
    // ──────────────────────────────────────────────────────────────────────────
    const state = {
        threadId: input.threadId,
        userId: input.userId,
        rawInput,
        known,
        open: thread.open,
        informationNeeds: [],
        leaning: thread.leaning,
        skepticArgument: thread.skepticArgument,
        skepticRisks: [],
        groundedFacts: [],
        groundingClaims: [],
        status: thread.status,
        nextAction: null,
        awaitingReply: false,
        awaitingHuman: false,
        awaitingSource: "NONE",
        pendingCloseConfirmation: false,
        injectedContext: input.injectedContext,
        resumePass: thread.currentPass
            .toLowerCase(),
    };
    // ──────────────────────────────────────────────────────────────────────────
    // Execute graph
    // ──────────────────────────────────────────────────────────────────────────
    const graph = buildShauriGraph();
    const result = await graph.invoke(state, {
        configurable: {
            thread_id: input.threadId,
        },
        metadata: {
            shauriThreadId: input.threadId,
            userId: input.userId,
        },
        tags: [
            "shauri",
            "decision-engine",
        ],
    });
    const finalState = result;
    // ──────────────────────────────────────────────────────────────────────────
    // Return user-facing result
    // ──────────────────────────────────────────────────────────────────────────
    return {
        reply: finalState.nextAction ||
            "I have updated the matter. What would you like to do next?",
        awaitingReply: Boolean(finalState.awaitingReply ||
            finalState.awaitingHuman ||
            finalState.awaitingSource !==
                "NONE"),
    };
}
