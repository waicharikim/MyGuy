"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInjectedContext = buildInjectedContext;
const prisma_1 = require("../infrastructure/prisma");
const model_1 = require("./model");
const profile_1 = require("./profile");
async function buildInjectedContext(userId, text) {
    const [profile, threads, tasks, notes] = await Promise.all([
        (0, profile_1.getProfileSnapshot)(userId),
        prisma_1.prisma.thread.findMany({ where: { userId, status: "OPEN" }, orderBy: { updatedAt: "desc" }, take: 8 }),
        prisma_1.prisma.task.findMany({ where: { userId, status: "open" }, orderBy: { createdAt: "desc" }, take: 8 }),
        prisma_1.prisma.note.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);
    const model = (0, model_1.getFastModel)(0);
    const items = [
        ...threads.map(t => ({ type: "thread", id: t.id, text: t.decisionSummary || [...t.known, ...t.open].join("; ") })),
        ...tasks.map(t => ({ type: "task", id: t.id, text: t.description })),
        ...notes.map(n => ({ type: "note", id: n.id, text: n.content })),
    ];
    let connections = "None found.";
    if (items.length) {
        const res = await model.invoke([
            { role: "system", content: "Identify only concrete connections between the new message and existing items. Do not infer a connection from broad topic similarity. Respond JSON array of {type,id,reason}; return [] if none." },
            { role: "user", content: JSON.stringify({ text, items }) },
        ]);
        try {
            const parsed = JSON.parse(String(res.content));
            connections = Array.isArray(parsed) && parsed.length ? parsed.map((x) => `${x.type} ${x.id}: ${x.reason}`).join("\n") : "None found.";
        }
        catch { }
    }
    return JSON.stringify({
        connections,
        profile: profile ?? null,
        openThreads: threads.map(t => ({ id: t.id, summary: t.decisionSummary, known: t.known, open: t.open })),
        openTasks: tasks.map(t => ({ id: t.id, description: t.description, dueAt: t.dueAt })),
        recentNotes: notes.map(n => ({ id: n.id, content: n.content })),
    });
}
