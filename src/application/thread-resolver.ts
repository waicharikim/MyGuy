/**
 * Thread resolution for inbound messages.
 *
 * Rules (in order):
 * 1. Exactly one open thread awaiting reply / human / close confirmation → continue it.
 * 2. Exactly one open thread total → continue it.
 * 3. Otherwise ask a fast model; only accept a high-confidence match.
 * 4. Otherwise return ambiguous (never pick newest by default).
 */

import { ThreadStatus } from "@prisma/client";
import { prisma } from "../infrastructure/prisma";
import { getFastModel } from "../agent/model";

export type ThreadResolution =
  | { type: "existing"; threadId: string }
  | { type: "new" }
  | { type: "ambiguous"; candidates: Array<{ id: string; summary: string }> };

const getModel = () => getFastModel(0);

function stripFences(raw: unknown): string {
  let s = String(raw ?? "").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json|JSON)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}

function isAwaitingUserOrOperator(t: {
  awaitingReply: boolean;
  pendingCloseConfirmation: boolean;
  awaitingHuman: boolean;
}): boolean {
  return t.awaitingReply || t.pendingCloseConfirmation || t.awaitingHuman;
}

function toCandidate(t: {
  id: string;
  known: string[];
  open: string[];
  decisionSummary: string | null;
}): { id: string; summary: string } {
  return {
    id: t.id,
    summary:
      t.decisionSummary ||
      [...t.known, ...t.open].slice(0, 3).join("; ") ||
      "Open matter",
  };
}

async function matchWithModel(
  text: string,
  candidates: Array<{ id: string; summary: string }>
): Promise<string | null> {
  const res = await getModel().invoke([
    {
      role: "system",
      content:
        'Determine whether the incoming message clearly belongs to exactly one existing open matter. Never choose merely because it is newest. Respond JSON: {"match": "thread-id"|null, "confidence": 0..1}. Only return a thread id when the relationship is specific and clear.',
    },
    {
      role: "user",
      content: JSON.stringify({ message: text, candidates }),
    },
  ]);

  try {
    const parsed = JSON.parse(stripFences(res.content)) as {
      match?: string | null;
      confidence?: number;
    };
    const id = parsed.match;
    const ok =
      typeof id === "string" &&
      candidates.some((c) => c.id === id) &&
      Number(parsed.confidence) >= 0.82;
    return ok ? id : null;
  } catch {
    return null;
  }
}

export async function resolveThread(
  userId: string,
  text: string
): Promise<ThreadResolution> {
  const threads = await prisma.thread.findMany({
    where: { userId, status: ThreadStatus.OPEN },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      known: true,
      open: true,
      decisionSummary: true,
      awaitingReply: true,
      currentPass: true,
      pendingCloseConfirmation: true,
      awaitingHuman: true,
    },
  });

  if (threads.length === 0) {
    return { type: "new" };
  }

  const awaiting = threads.filter(isAwaitingUserOrOperator);
  if (awaiting.length === 1) {
    return { type: "existing", threadId: awaiting[0].id };
  }

  if (threads.length === 1) {
    return { type: "existing", threadId: threads[0].id };
  }

  const candidates = threads.map(toCandidate);
  const matchId = await matchWithModel(text, candidates);
  if (matchId) {
    return { type: "existing", threadId: matchId };
  }

  return { type: "ambiguous", candidates };
}