import "dotenv/config";
import { handleMessage } from "../src/agent/central";

async function main() {
  const phone = "254700000000";

  const turn1 = await handleMessage(
    phone,
    "Should I take the accounting job in Nairobi or stay freelance?"
  );
  console.log("--- Turn 1 ---\n", turn1.reply, "\n");

  const turn2 = await handleMessage(
    phone,
    "I've freelanced for 2 years — unstable income but I like the flexibility. The job pays more but adds a 1hr commute."
  );
  console.log("--- Turn 2 ---\n", turn2.reply, "\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
