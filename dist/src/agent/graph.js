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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShauriGraph = buildShauriGraph;
exports.runShauriGraph = runShauriGraph;
const langgraph_1 = require("@langchain/langgraph");
const tavily_search_1 = require("@langchain/community/tools/tavily_search");
const client_1 = require("@prisma/client");
const model_1 = require("./model");
const prisma_1 = require("../infrastructure/prisma");
const thread_1 = require("../domain/thread");
const decision_messaging_1 = require("./decision-messaging");
const decision_contract_1 = require("./decision-contract");
const create_task_1 = require("../tools/create_task");
const schedule_followup_1 = require("../tools/schedule_followup");
const human_query_1 = require("./human-query");
const decision_record_1 = require("./decision-record");
const decision_outcome_1 = require("./decision-outcome");
const escalation_1 = require("./escalation");
const profile_1 = require("./profile");
const human_routing_1 = require("./human-routing");
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
function resolveInformationSource(need) {
    return (informationSourceByFactType[need.factType] ??
        need.preferredSource);
}
function requiresHumanRouting(need) {
    const source = resolveInformationSource(need);
    return (source === "USER" ||
        source === "OPERATOR");
}
async function routeHumanInformationNeed(state, need) {
    const source = resolveInformationSource(need);
    const authorityHint = need.factType === "HUMAN_VERIFICATION"
        ? "NONE"
        : source === "EXTERNAL"
            ? "USER"
            : source === "USER" || source === "OPERATOR"
                ? source
                : "NONE";
    return (0, human_routing_1.determineHumanQuerySource)({
        matter: state.known.join("; "),
        question: need.question ||
            need.fact ||
            "What information is missing?",
        reason: need.reason ||
            "Additional human information is required.",
        known: state.known,
        open: state.open,
        authorityHint,
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
    awaitingHuman: (langgraph_1.Annotation),
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
const getTavily = () => process.env.TAVILY_API_KEY
    ? new tavily_search_1.TavilySearchResults({
        maxResults: 5,
    })
    : null;
// ─────────────────────────────────────────────────────────────────────────────
// JSON helpers
// ─────────────────────────────────────────────────────────────────────────────
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
async function createRoutedHumanQuery(state, need) {
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
        source: source === "OPERATOR"
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
    const requiredHumanNeeds = informationNeeds.filter((need) => need.required &&
        requiresHumanRouting(need));
    if (requiredHumanNeeds.length > 0) {
        const first = requiredHumanNeeds[0];
        const { q, source, } = await createRoutedHumanQuery(state, first);
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
    const humanEvidence = state.known.filter((k) => String(k).startsWith("Human-provided evidence:"));
    if (humanEvidence.length > 0) {
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
            groundedFacts: [
                ...state.groundedFacts,
                ...humanEvidence.map((e) => String(e)),
            ],
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
    // ──────────────────────────────────────────────────────────────────────────
    // External grounding unavailable
    // ──────────────────────────────────────────────────────────────────────────
    if (!tavily) {
        const need = {
            question: `I couldn't check reliable public sources for these details: ${claims.join("; ")}. If you have the exact organization or product name, an official link, or a document you can share, please send it. Otherwise, I can only give cautious general guidance.`,
            fact: claims.join("; "),
            factType: "EXTERNAL_FACT",
            preferredSource: "EXTERNAL",
            required: true,
            reason: "Reliable external evidence is not available yet; request a source or identifying details from the user rather than asking an operator to verify public claims.",
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
    if (!evidence.length) {
        const need = {
            question: `I couldn't verify these details from reliable public sources: ${claims.join("; ")}. Do you have an official link, a document, or the exact organization or product name I should check?`,
            fact: claims.join("; "),
            factType: "EXTERNAL_FACT",
            preferredSource: "EXTERNAL",
            required: true,
            reason: "Web research returned no usable evidence; ask the user for a source or identifying details instead of assigning unsupported verification to an operator.",
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
You are Shauri Close — a calm decision coach for WhatsApp.

Write for the user in plain language (not an operator checklist).

Return ONLY JSON:
{
  "nextAction": "2–4 short sentences the user should see",
  "recommendedOption": "one option to consider, or null if information is insufficient",
  "confidence": 0.0,
  "assumptions": ["explicit assumptions behind the recommendation"],
  "unresolvedRisks": ["material unresolved risks"],
  "unresolvedQuestions": ["material facts or questions that remain unresolved"],
  "escalate": false,
  "resolved": false,
  "humanQuery": false,
  "decisionSummary": "one line internal summary"
}

Rules:

- confidence is your estimate of how well-supported the recommendation is, from 0 to 1; use null with a null recommendation when you cannot responsibly recommend an option.
- Never invent evidence, and lower confidence when facts are missing, disputed, or weakly sourced.
- A resolved decision requires a recommendation; do not mark unresolved choices as resolved.
- Include only material assumptions, unresolved risks, and unanswered material questions.
- Keep unanswered facts in unresolvedQuestions; do not present them as assumptions.
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
            content: JSON.stringify({
                known: state.known.filter((k) => !String(k).startsWith("Human-provided evidence:")),
                humanEvidence: state.known.filter((k) => String(k).startsWith("Human-provided evidence:")),
                leaning: state.leaning,
                skeptic: state.skepticArgument,
                risks: state.skepticRisks,
                evidence: state.groundedFacts,
                input: state.rawInput,
            }),
        },
    ]);
    const parsed = (0, decision_contract_1.parseDecisionCloseOutput)(res.content);
    const decisionStatus = parsed.escalate
        ? client_1.DecisionRecordStatus.ESCALATED
        : parsed.humanQuery
            ? client_1.DecisionRecordStatus.AWAITING_HUMAN
            : client_1.DecisionRecordStatus.OPEN;
    const humanInputs = state.known.filter((entry) => String(entry).includes("User-provided answer:") ||
        String(entry).includes("Human-provided evidence:"));
    await (0, decision_record_1.upsertDecisionRecord)({
        userId: state.userId,
        threadId: state.threadId,
        matter: state.known.join("; ") || state.rawInput,
        status: decisionStatus,
        decisionSummary: parsed.decisionSummary,
        goal: state.rawInput,
        recommendedOption: parsed.recommendedOption,
        confidence: parsed.confidence,
        risks: Array.from(new Set([
            ...state.skepticRisks,
            ...parsed.unresolvedRisks,
        ])),
        assumptions: parsed.assumptions,
        unresolvedQuestions: Array.from(new Set([
            ...state.open,
            ...parsed.unresolvedQuestions,
        ])),
        evidenceRefs: state.groundedFacts,
        humanInputs,
        escalationReason: parsed.escalate
            ? parsed.nextAction
            : null,
    });
    if (parsed.humanQuery) {
        const need = {
            question: (0, decision_contract_1.formatDecisionRecommendation)(parsed),
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
            nextAction: (0, decision_contract_1.formatDecisionRecommendation)(parsed),
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
            nextAction: `${(0, decision_contract_1.formatDecisionRecommendation)(parsed)}\n\nThis sounds settled. Should I close this matter? (yes/no)`,
        };
        await checkpoint({
            ...state,
            ...next,
        }, "CLOSE");
        return next;
    }
    await (0, create_task_1.createTask)({
        userId: state.userId,
        threadId: state.threadId,
        description: (0, decision_contract_1.formatDecisionRecommendation)(parsed),
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
        promptContext: (0, decision_contract_1.formatDecisionRecommendation)(parsed),
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
        if (s.awaitingSource ===
            "OPERATOR") {
            return langgraph_1.END;
        }
        if (s.awaitingSource ===
            "USER" ||
            s.awaitingReply) {
            return langgraph_1.END;
        }
        return "skeptic";
    })
        .addEdge("skeptic", "ground")
        .addConditionalEdges("ground", (s) => {
        if (s.awaitingSource ===
            "OPERATOR") {
            return langgraph_1.END;
        }
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
        await (0, decision_record_1.updateDecisionRecordStatus)(threadId, client_1.DecisionRecordStatus.OPEN);
        return {
            reply: (0, decision_messaging_1.formatDecisionReply)("No problem. What is still open about this?", {
                status: "OPEN",
                awaitingReply: true,
                awaitingHuman: false,
                awaitingSource: "USER",
                pendingCloseConfirmation: false,
            }),
            awaitingReply: true,
        };
    }
    await thread_1.threadState.transition(threadId, "close", "CLOSE");
    await (0, decision_record_1.updateDecisionRecordStatus)(threadId, client_1.DecisionRecordStatus.RESOLVED);
    await (0, profile_1.updateProfileFromThread)(userId, threadId);
    return {
        reply: (0, decision_messaging_1.formatDecisionReply)("Closed out — the matter is marked settled.", {
            status: "CLOSED",
            awaitingReply: false,
            awaitingHuman: false,
            awaitingSource: "NONE",
            pendingCloseConfirmation: false,
        }),
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
    if (thread.outcomeRequestedAt) {
        await (0, decision_outcome_1.captureRequestedDecisionOutcome)(thread.id, input.rawInput);
    }
    await (0, decision_record_1.ensureDecisionRecord)({
        userId: input.userId,
        threadId: input.threadId,
        matter: thread.decisionSummary ||
            thread.known.join("; ") ||
            input.rawInput,
        status: thread.status === "ESCALATED"
            ? client_1.DecisionRecordStatus.ESCALATED
            : thread.awaitingHuman
                ? client_1.DecisionRecordStatus.AWAITING_HUMAN
                : client_1.DecisionRecordStatus.OPEN,
        goal: input.rawInput,
    });
    // ──────────────────────────────────────────────────────────────────────────
    // Explicit close confirmation
    // ──────────────────────────────────────────────────────────────────────────
    if (thread.pendingCloseConfirmation) {
        return closeConfirmation(input.threadId, input.userId, input.rawInput);
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
    if (thread.awaitingHuman &&
        thread.awaitingSource ===
            "OPERATOR") {
        const operatorQuery = await prisma_1.prisma.humanQuery.findFirst({
            where: {
                threadId: thread.id,
                status: "OPEN",
                source: "OPERATOR",
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        if (operatorQuery) {
            return {
                reply: (0, decision_messaging_1.formatDecisionReply)(operatorQuery.question, {
                    status: thread.status,
                    awaitingReply: true,
                    awaitingHuman: true,
                    awaitingSource: "OPERATOR",
                    pendingCloseConfirmation: false,
                }),
                awaitingReply: true,
            };
        }
        return {
            reply: (0, decision_messaging_1.formatDecisionReply)("I'm still waiting for the human information needed to continue this matter.", {
                status: thread.status,
                awaitingReply: true,
                awaitingHuman: true,
                awaitingSource: "OPERATOR",
                pendingCloseConfirmation: false,
            }),
            awaitingReply: true,
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
    let rawInput = input.rawInput;
    let known = thread.known;
    let resumePassFromHumanQuery = null;
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
            const source = q.source === "OPERATOR"
                ? "OPERATOR"
                : "USER";
            /**
             * Defensive operator guard.
             *
             * This should normally have been caught by the hard pause
             * above, but keep the protection here as a second boundary.
             */
            if (source === "OPERATOR") {
                return {
                    reply: (0, decision_messaging_1.formatDecisionReply)(q.question, {
                        status: thread.status,
                        awaitingReply: true,
                        awaitingHuman: true,
                        awaitingSource: "OPERATOR",
                        pendingCloseConfirmation: false,
                    }),
                    awaitingReply: true,
                };
            }
            /*
             * Capture the pass BEFORE mutating the thread.
             */
            const persistedPass = thread.currentPass.toLowerCase();
            const validPasses = [
                "intake",
                "skeptic",
                "ground",
                "close",
            ];
            if (validPasses.includes(persistedPass)) {
                resumePassFromHumanQuery =
                    persistedPass;
            }
            else {
                resumePassFromHumanQuery =
                    "intake";
            }
            /*
             * The user's message answers the open HumanQuery.
             *
             * answerHumanQuery owns the HumanQuery lifecycle.
             */
            await (0, human_query_1.answerHumanQuery)(q.id, input.rawInput);
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
            await prisma_1.prisma.thread.update({
                where: {
                    id: thread.id,
                },
                data: {
                    awaitingHuman: false,
                    awaitingReply: false,
                    awaitingSource: "NONE",
                    /*
                     * Resume the pass that originally asked the question.
                     */
                    currentPass: resumePassFromHumanQuery ===
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
    const validPasses = [
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
    const persistedPass = resumePassFromHumanQuery ??
        thread.currentPass.toLowerCase();
    const resumePass = validPasses.includes(persistedPass)
        ? persistedPass
        : "intake";
    // ──────────────────────────────────────────────────────────────────────────
    // Build state
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
        resumePass,
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
        reply: (0, decision_messaging_1.formatDecisionReply)(finalState.nextAction ||
            "I have updated the matter. What would you like to do next?", {
            status: finalState.status,
            awaitingReply: Boolean(finalState.awaitingReply),
            awaitingHuman: Boolean(finalState.awaitingHuman),
            awaitingSource: finalState.awaitingSource,
            pendingCloseConfirmation: Boolean(finalState.pendingCloseConfirmation),
        }),
        awaitingReply: Boolean(finalState.awaitingReply ||
            finalState.awaitingHuman ||
            finalState.awaitingSource !==
                "NONE"),
    };
}
