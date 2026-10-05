/**
 * Smoke: two open matters, then an ambiguous follow-up.
 * Should clarify rather than attach to the newest thread.
 */

import "dotenv/config";
import { handleMessage } from "../src/agent/central";
import { prisma } from "../src/infrastructure/prisma";

async function main() {
  const phone = "254700000001";

  const t1 = await handleMessage(
    phone,
    "Decision: should I take the accounting job in Nairobi (KES 120k/month, 1hr commute) or stay freelance (unstable but flexible, currently ~KES 90k/month average)? I need to decide by Friday."
  );
  console.log("--- Thread A, turn 1 ---\n", t1.reply, "\n");

  const t2 = await handleMessage(
    phone,
    "Separate decision: should I buy the empty plot next to my parents' place near Mikeu for KES 800k, or wait until next year when I'll have a bigger deposit?"
  );
  console.log("--- Thread B, turn 1 ---\n", t2.reply, "\n");

  const ambiguous = await handleMessage(
    phone,
    "I think I'm going to go ahead with it."
  );
  console.log("--- Ambiguous message ---\n", ambiguous.reply);

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