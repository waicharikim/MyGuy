"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
const prisma_1 = require("../infrastructure/prisma");
async function createTask(input) {
    if (input.idempotencyKey) {
        const existing = await prisma_1.prisma.task.findFirst({ where: { userId: input.userId, description: input.description } });
        if (existing)
            return { taskId: existing.id };
    }
    const task = await prisma_1.prisma.task.create({ data: { userId: input.userId, threadId: input.threadId, description: input.description, dueAt: input.dueAt } });
    return { taskId: task.id };
}
