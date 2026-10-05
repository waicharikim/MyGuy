"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfileSnapshot = getProfileSnapshot;
exports.updateProfileFromThread = updateProfileFromThread;
const prisma_1 = require("../infrastructure/prisma");
const model_1 = require("./model");
const getModel = () => (0, model_1.getChatModel)(0.2);
async function getProfileSnapshot(userId) {
    const profile = await prisma_1.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile)
        return null;
    return {
        summary: profile.summary,
        values: profile.values,
        recurringConcerns: profile.recurringConcerns,
        communicationStyle: profile.communicationStyle,
        pastDecisions: profile.pastDecisions.slice(-6),
    };
}
async function updateProfileFromThread(userId, threadId) {
    const [thread, existing] = await Promise.all([
        prisma_1.prisma.thread.findUniqueOrThrow({ where: { id: threadId } }),
        prisma_1.prisma.userProfile.findUnique({ where: { userId } }),
    ]);
    const res = await getModel().invoke([
        { role: "system", content: 'Maintain a compact evolving user profile. Update rather than replace. Preserve supported information, incorporate new information, and avoid inventing traits. Return ONLY JSON: {"summary":"","values":[],"recurringConcerns":[],"communicationStyle":null}. Max 150 words; max 6 values and 6 concerns.' },
        { role: "user", content: JSON.stringify({ existing: existing ?? { summary: "", values: [], recurringConcerns: [], communicationStyle: null }, thread: { summary: thread.decisionSummary, known: thread.known, status: thread.status } }) },
    ]);
    let parsed;
    try {
        parsed = JSON.parse(String(res.content));
    }
    catch {
        return;
    }
    const entry = { threadId, summary: thread.decisionSummary || thread.known.join("; "), outcome: thread.status };
    await prisma_1.prisma.userProfile.upsert({
        where: { userId },
        create: { userId, summary: String(parsed.summary || ""), values: Array.isArray(parsed.values) ? parsed.values.slice(0, 6) : [], recurringConcerns: Array.isArray(parsed.recurringConcerns) ? parsed.recurringConcerns.slice(0, 6) : [], communicationStyle: parsed.communicationStyle || null, pastDecisions: [entry] },
        update: { summary: String(parsed.summary || ""), values: Array.isArray(parsed.values) ? parsed.values.slice(0, 6) : [], recurringConcerns: Array.isArray(parsed.recurringConcerns) ? parsed.recurringConcerns.slice(0, 6) : [], communicationStyle: parsed.communicationStyle || null, pastDecisions: { push: entry } },
    });
}
