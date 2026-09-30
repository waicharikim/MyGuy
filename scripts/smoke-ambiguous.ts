import "dotenv/config";
import { handleMessage } from "../src/agent/central";

// Give the model everything it needs up front so intake doesn't pause to
// ask a clarifying question — that's what keeps the thread "awaiting" and
// would make the router treat the next message as a continuation instead
// of a new thread. If either turn still comes back asking a question,
// answer it (append another handleMessage call) before moving on.

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

  const ambiguous = await handleMessage(phone, "I think I'm going to go ahead with it.");
  console.log("--- Ambiguous message ---\n", ambiguous.reply);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
