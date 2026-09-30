import "dotenv/config";
import { handleMessage } from "../src/agent/central";
import { prisma } from "../src/infrastructure/prisma";

// Run this with TAVILY_API_KEY unset (or temporarily commented out) so
// ground() takes the "no grounding available" branch and creates a
// HumanQuery instead of calling Tavily. A decision with a checkable
// factual claim makes it likely the claims-extraction step finds
// something to verify.

async function main() {
  const phone = "254700000002";

  const t1 = await handleMessage(
    phone,
    "A SACCO in Kiambu is promising 20% annual returns if I invest my savings with them — should I do it? I have about KES 300k saved."
  );
  console.log("--- Turn 1 ---\n", t1.reply, "\n");

  const query = await prisma.humanQuery.findFirst({
    where: { question: { not: undefined } },
    orderBy: { createdAt: "desc" },
  });

  if (!query) {
    console.log("No HumanQuery was created — intake may still be waiting on a clarifying reply, or ground() found no claims worth checking. Inspect the Thread row or send another turn.");
  } else {
    console.log("HumanQuery created:", { id: query.id, question: query.question, reason: query.reason });
    console.log(
      "\nTo answer it as the operator:\n" +
      `curl -X POST http://localhost:3000/internal/human/queries/${query.id}/answer \\\n` +
      `  -H "x-operator-token: $INTERNAL_OPERATOR_TOKEN" -H "Content-Type: application/json" \\\n` +
      `  -d '{"answer": "That SACCO is not registered with SASRA — treat the 20% claim as unverified."}'`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
