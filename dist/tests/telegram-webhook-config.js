"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const telegram_webhook_1 = require("../scripts/telegram-webhook");
const webhook_config_1 = require("../src/telegram/webhook-config");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
function expectFailure(action, message) {
    try {
        action();
    }
    catch {
        return;
    }
    throw new Error(`TEST FAILED: ${message}`);
}
assert((0, webhook_config_1.isTelegramWebhookUrl)("https://sample.ngrok-free.app/webhook/telegram"), "Public HTTPS Telegram endpoint should be accepted.");
assert(!(0, webhook_config_1.isTelegramWebhookUrl)("http://sample.ngrok-free.app/webhook/telegram"), "HTTP must be rejected.");
assert(!(0, webhook_config_1.isTelegramWebhookUrl)("https://sample.ngrok-free.app/other"), "Unrelated route must be rejected.");
assert(!(0, webhook_config_1.isTelegramWebhookUrl)("https://sample.ngrok-free.app/webhook/telegram?token=x"), "Webhook URLs with query parameters must be rejected.");
assert((0, telegram_webhook_1.findNgrokWebhookUrl)([
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
], 3000) === "https://sample.ngrok-free.app/webhook/telegram", "Development registration must choose the HTTPS tunnel forwarding to the API port.");
expectFailure(() => (0, telegram_webhook_1.findNgrokWebhookUrl)([
    {
        public_url: "https://wrong-port.ngrok-free.app",
        proto: "https",
        config: { addr: "http://localhost:4000" },
    },
], 3000), "A tunnel for another port should not be selected.");
console.log("✓ ngrok selects only the matching HTTPS tunnel and validates webhook URLs");
console.log("TELEGRAM WEBHOOK CONFIG TEST PASSED");
