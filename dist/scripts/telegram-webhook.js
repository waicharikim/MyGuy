"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findNgrokWebhookUrl = findNgrokWebhookUrl;
exports.registerTelegramWebhook = registerTelegramWebhook;
require("dotenv/config");
const webhook_config_1 = require("../src/telegram/webhook-config");
function requiredEnvironment(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}
function assertTelegramCredentials() {
    requiredEnvironment("TELEGRAM_BOT_TOKEN");
    if (requiredEnvironment("TELEGRAM_WEBHOOK_SECRET").length < 32) {
        throw new Error("TELEGRAM_WEBHOOK_SECRET must be at least 32 characters");
    }
}
function matchesLocalPort(address, port) {
    if (!address) {
        return false;
    }
    try {
        return new URL(address.includes("://") ? address : `http://${address}`).port === String(port);
    }
    catch {
        return new RegExp(`:${port}(?:/|$)`).test(address);
    }
}
function findNgrokWebhookUrl(tunnels, port) {
    const tunnel = tunnels.find((candidate) => candidate.proto === "https" &&
        matchesLocalPort(candidate.config?.addr, port) &&
        (0, webhook_config_1.isTelegramWebhookUrl)(`${candidate.public_url}/webhook/telegram`));
    if (!tunnel?.public_url) {
        throw new Error(`No ngrok HTTPS tunnel forwarding to local port ${port} was found. Start it with "ngrok http ${port}".`);
    }
    return `${tunnel.public_url}/webhook/telegram`;
}
async function responseJson(response) {
    if (!response.ok) {
        throw new Error(`Request failed with HTTP ${response.status}`);
    }
    return response.json();
}
async function registerTelegramWebhook(url) {
    if (!(0, webhook_config_1.isTelegramWebhookUrl)(url)) {
        throw new Error("Webhook URL must be HTTPS and end exactly with /webhook/telegram");
    }
    assertTelegramCredentials();
    const token = requiredEnvironment("TELEGRAM_BOT_TOKEN");
    const result = await responseJson(await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            url,
            secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
            allowed_updates: ["message"],
        }),
    }));
    if (!result.ok) {
        throw new Error(`Telegram rejected webhook registration: ${result.description ?? "no details"}`);
    }
    console.log(`Telegram webhook registered: ${url}`);
}
async function registerDevelopmentTunnel() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("The ngrok development command cannot run in production");
    }
    assertTelegramCredentials();
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("PORT must be a valid TCP port");
    }
    const ngrok = await responseJson(await fetch("http://127.0.0.1:4040/api/tunnels"));
    const url = findNgrokWebhookUrl(ngrok.tunnels ?? [], port);
    await registerTelegramWebhook(url);
}
async function deleteWebhook() {
    assertTelegramCredentials();
    const token = requiredEnvironment("TELEGRAM_BOT_TOKEN");
    const result = await responseJson(await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
        method: "POST",
    }));
    if (!result.ok) {
        throw new Error(`Telegram rejected webhook deletion: ${result.description ?? "no details"}`);
    }
    console.log("Telegram webhook deleted.");
}
async function main() {
    const command = process.argv[2];
    if (command === "set-dev") {
        await registerDevelopmentTunnel();
        return;
    }
    if (command === "set-url") {
        await registerTelegramWebhook(requiredEnvironment("TELEGRAM_WEBHOOK_URL"));
        return;
    }
    if (command === "delete") {
        await deleteWebhook();
        return;
    }
    throw new Error("Usage: ts-node scripts/telegram-webhook.ts <set-dev|set-url|delete>");
}
if (require.main === module) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : "Telegram webhook command failed");
        process.exitCode = 1;
    });
}
