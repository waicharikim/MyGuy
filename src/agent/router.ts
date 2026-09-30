import { prisma } from "../infrastructure/prisma";
import { getFastModel } from "./model";

const getModel = () => getFastModel(0);

export type Intent =
  | "shauri_new"
  | "shauri_continue"
  | "task_create"
  | "note_create"
  | "finance_query"
  | "escalation_request"
  | "unclear";

export interface RouteResult {
  intent: Intent;
  threadId?: string;
  extracted?: string;
}

function stripFences(raw: unknown): string {
  let s = String(raw ?? "").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}

function parseRoute(value: unknown): RouteResult {
  try {
    const text =
      typeof value === "string" ? stripFences(value) : JSON.stringify(value);
    const parsed = JSON.parse(text) as {
      intent?: string;
      extracted?: string;
    };
    const allowed: Intent[] = [
      "shauri_new",
      "shauri_continue",
      "task_create",
      "note_create",
      "finance_query",
      "escalation_request",
      "unclear",
    ];
    const intent = allowed.includes(parsed?.intent as Intent)
      ? (parsed.intent as Intent)
      : "unclear";
    return {
      intent,
      extracted:
        typeof parsed?.extracted === "string"
          ? parsed.extracted.trim()
          : undefined,
    };
  } catch {
    return { intent: "unclear" };
  }
}

export async function routeMessage(
  userId: string,
  text: string
): Promise<RouteResult> {
  const awaiting = await prisma.thread.findMany({
    where: {
      userId,
      status: "OPEN",
      OR: [
        { awaitingReply: true },
        { pendingCloseConfirmation: true },
        { awaitingHuman: true },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  if (awaiting.length === 1) {
    return { intent: "shauri_continue", threadId: awaiting[0].id };
  }

  const res = await getModel().invoke([
    {
      role: "system",
      content:
        'Classify the message. Respond only JSON: {"intent":"shauri_new|shauri_continue|task_create|note_create|finance_query|escalation_request|unclear","extracted":""}. Never infer shauri_continue without a clear reference to an existing matter.',
    },
    { role: "user", content: text },
  ]);
  return parseRoute(res.content);
}