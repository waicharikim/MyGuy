import { prisma } from "../infrastructure/prisma";
export interface CreateNoteInput { userId: string; threadId?: string; content: string; }
export async function createNote(input: CreateNoteInput) {
  const note = await prisma.note.create({ data: { userId: input.userId, threadId: input.threadId, content: input.content } });
  return { noteId: note.id };
}
