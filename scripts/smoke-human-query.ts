/**
 * Smoke: force the HumanQuery path.
 *
 * Prerequisites:
 * - TAVILY_API_KEY unset/empty so ground() falls back to operator HumanQuery.
 * - Real or mock LLM configured.
 */

import "dotenv/config";
import { handleMessage } from "../src/agent/central";
import { prisma } from "../src/infrastructure/prisma";

async function main() {
  const phone = "254700000002";

  const t1 = await handleMessage(
    phone,
    "Decision: should I put KES 300k into a Kiambu SACCO promising 20% annual returns, or keep the money in my bank account? I need to decide this week."
  );
  console.log("--- Turn 1 ---\n", t1.reply, "\n");

  const query = await prisma.humanQuery.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!query) {
    console.log(
      "No HumanQuery was created — intake may still be waiting on a clarifying reply, or ground() found no claims worth checking. Inspect the Thread row or send another turn."
    );
  } else {
    console.log("HumanQuery created:", {
      id: query.id,
      question: query.question,
      reason: query.reason,
      source: query.source,
      status: query.status,
    });
    console.log(
      "\nTo answer it as the operator:\n" +
        `curl -X POST http://localhost:3000/internal/human/queries/${query.id}/answer \\\n` +
        `  -H "x-operator-token: $INTERNAL_OPERATOR_TOKEN" -H "Content-Type: application/json" \\\n` +
        `  -d '{"answer": "That SACCO is not registered with SASRA — treat the 20% claim as unverified."}'`
    );
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});