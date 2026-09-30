"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNote = createNote;
const prisma_1 = require("../infrastructure/prisma");
async function createNote(input) {
    const note = await prisma_1.prisma.note.create({ data: { userId: input.userId, threadId: input.threadId, content: input.content } });
    return { noteId: note.id };
}
