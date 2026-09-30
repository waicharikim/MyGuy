import { prisma } from "../infrastructure/prisma";
import { getChatModel } from "./model";

const getModel = () => getChatModel(0.2);
export interface ProfileSnapshot { summary: string; values: string[]; recurringConcerns: string[]; communicationStyle: string | null; }

export async function getProfileSnapshot(userId: string): Promise<ProfileSnapshot | null> {
  const profile = await prisma.userProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  return { summary: profile.summary, values: profile.values, recurringConcerns: profile.recurringConcerns, communicationStyle: profile.communicationStyle };
}

export async function updateProfileFromThread(userId: string, threadId: string): Promise<void> {
  const [thread, existing] = await Promise.all([
    prisma.thread.findUniqueOrThrow({ where: { id: threadId } }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);
  const res = await getModel().invoke([
    { role: "system", content: 'Maintain a compact evolving user profile. Update rather than replace. Preserve supported information, incorporate new information, and avoid inventing traits. Return ONLY JSON: {"summary":"","values":[],"recurringConcerns":[],"communicationStyle":null}. Max 150 words; max 6 values and 6 concerns.' },
    { role: "user", content: JSON.stringify({ existing: existing ?? { summary: "", values: [], recurringConcerns: [], communicationStyle: null }, thread: { summary: thread.decisionSummary, known: thread.known, status: thread.status } }) },
  ]);
  let parsed: any;
  try { parsed = JSON.parse(String(res.content)); } catch { return; }
  const entry = { threadId, summary: thread.decisionSummary || thread.known.join("; "), outcome: thread.status };
  await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, summary: String(parsed.summary || ""), values: Array.isArray(parsed.values) ? parsed.values.slice(0, 6) : [], recurringConcerns: Array.isArray(parsed.recurringConcerns) ? parsed.recurringConcerns.slice(0, 6) : [], communicationStyle: parsed.communicationStyle || null, pastDecisions: [entry] },
    update: { summary: String(parsed.summary || ""), values: Array.isArray(parsed.values) ? parsed.values.slice(0, 6) : [], recurringConcerns: Array.isArray(parsed.recurringConcerns) ? parsed.recurringConcerns.slice(0, 6) : [], communicationStyle: parsed.communicationStyle || null, pastDecisions: { push: entry } },
  });
}
