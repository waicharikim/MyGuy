/**
 * Smoke: basic two-turn decision path.
 * Resets its test user before execution.
 * Exits explicitly so open handles cannot hold the process open.
 */

import "dotenv/config";

import { handleMessage } from "../src/agent/central";
import { prisma } from "../src/infrastructure/prisma";
import { resetSmokeUser } from "./reset-smoke";

async function main() {
  const phone =
    process.env.SMOKE_TEST_PHONE ||
    "254700000000";

  await resetSmokeUser(phone);

  const turn1 = await handleMessage(
    phone,
    "Should I take the accounting job in Nairobi or stay freelance?",
  );

  console.log(
    "--- Turn 1 ---\n",
    turn1.reply,
    "\n",
  );

  const turn2 = await handleMessage(
    phone,
    "I've freelanced for 2 years — unstable income but I like the flexibility. The job pays more but adds a 1hr commute.",
  );

  console.log(
    "--- Turn 2 ---\n",
    turn2.reply,
    "\n",
  );

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