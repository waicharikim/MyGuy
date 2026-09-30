import { prisma } from "../infrastructure/prisma";
export interface CreateTaskInput { userId: string; threadId?: string; description: string; dueAt?: Date; idempotencyKey?: string; }
export async function createTask(input: CreateTaskInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.task.findFirst({ where: { userId: input.userId, description: input.description } });
    if (existing) return { taskId: existing.id };
  }
  const task = await prisma.task.create({ data: { userId: input.userId, threadId: input.threadId, description: input.description, dueAt: input.dueAt } });
  return { taskId: task.id };
}
