import {
  findNgrokWebhookUrl,
} from "../scripts/telegram-webhook";
import { isTelegramWebhookUrl } from "../src/telegram/webhook-config";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function expectFailure(action: () => unknown, message: string) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(`TEST FAILED: ${message}`);
}

assert(
  isTelegramWebhookUrl("https://sample.ngrok-free.app/webhook/telegram"),
  "Public HTTPS Telegram endpoint should be accepted.",
);
assert(
  !isTelegramWebhookUrl("http://sample.ngrok-free.app/webhook/telegram"),
  "HTTP must be rejected.",
);
assert(
  !isTelegramWebhookUrl("https://sample.ngrok-free.app/other"),
  "Unrelated route must be rejected.",
);
assert(
  !isTelegramWebhookUrl("https://sample.ngrok-free.app/webhook/telegram?token=x"),
  "Webhook URLs with query parameters must be rejected.",
);
assert(
  findNgrokWebhookUrl(
    [
      {
        public_url: "http://sample.ngrok-free.app",
        proto: "http",
        config: { addr: "http://localhost:3000" },
      },
      {
        public_url: "https://sample.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:3000" },
      },
      {
        public_url: "https://wrong-port.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:4000" },
      },
    ],
    3000,
  ) === "https://sample.ngrok-free.app/webhook/telegram",
  "Development registration must choose the HTTPS tunnel forwarding to the API port.",
);
expectFailure(
  () =>
    findNgrokWebhookUrl(
      [
        {
          public_url: "https://wrong-port.ngrok-free.app",
          proto: "https",
          config: { addr: "http://localhost:4000" },
        },
      ],
      3000,
    ),
  "A tunnel for another port should not be selected.",
);

console.log("✓ ngrok selects only the matching HTTPS tunnel and validates webhook URLs");
console.log("TELEGRAM WEBHOOK CONFIG TEST PASSED");
