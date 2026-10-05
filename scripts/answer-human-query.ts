/**
 * Answer a HumanQuery from the CLI without WhatsApp or HTTP.
 * Persists the answer and resumes the graph; skips real WA sends.
 */
import "dotenv/config";
import { resumeHumanQueryFromOperator } from "../src/agent/human-query";
import { runShauriGraph } from "../src/agent/graph";
import { buildInjectedContext } from "../src/agent/context";
import { prisma } from "../src/infrastructure/prisma";

async function main() {
  const id = process.argv[2];
  const answer = process.argv[3];
  if (!id || !answer) {
    console.error(
      'Usage: ts-node scripts/answer-human-query.ts <queryId> "<answer text>"'
    );
    process.exit(1);
  }

  const result = await resumeHumanQueryFromOperator(id, answer, {
    // no-op send so local ops don't need Meta credentials
    sendWhatsappMessage: async (phone, text) => {
      console.log(`[dev WhatsApp skip] to=${phone}\n${text}\n`);
    },
    runShauriGraph,
    buildInjectedContext,
  });

  console.log("Query status:", result.query.status);
  console.log("Shauri reply:\n", result.reply);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});