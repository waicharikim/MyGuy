"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const environment_1 = require("../src/config/environment");
function assert(condition, message) {
    if (!condition) {
        throw new Error(`TEST FAILED: ${message}`);
    }
}
const base = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://localhost/shauri",
    REDIS_HOST: "localhost",
    TAVILY_API_KEY: "test",
    WHATSAPP_PHONE_NUMBER_ID: "test",
    WHATSAPP_TOKEN: "test",
    WHATSAPP_APP_SECRET: "test",
    WHATSAPP_VERIFY_TOKEN: "test",
    OPERATOR_WHATSAPP_PHONE: "254700000000",
    INTERNAL_OPERATOR_TOKEN: "a".repeat(32),
    PA_SESSION_SECRET: "b".repeat(32),
    PA_ALLOWED_ORIGINS: "https://pa.example.com",
    ANTHROPIC_API_KEY: "test",
    REQUIRE_PAYMENT: "false",
};
(0, environment_1.validateProductionEnvironment)(base);
let weakTokenRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        INTERNAL_OPERATOR_TOKEN: "short",
    });
}
catch (error) {
    weakTokenRejected =
        error instanceof Error &&
            error.message.includes("INTERNAL_OPERATOR_TOKEN");
}
assert(weakTokenRejected, "Production must reject a weak operator token.");
let missingProviderRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        ANTHROPIC_API_KEY: undefined,
    });
}
catch (error) {
    missingProviderRejected =
        error instanceof Error && error.message.includes("one LLM provider");
}
assert(missingProviderRejected, "Production must require an LLM provider.");
let sandboxPaymentRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        REQUIRE_PAYMENT: "true",
        MPESA_CONSUMER_KEY: "test",
        MPESA_CONSUMER_SECRET: "test",
        MPESA_SHORTCODE: "test",
        MPESA_PASSKEY: "test",
        MPESA_CALLBACK_URL: "https://example.test/callback",
        MPESA_BASE_URL: "https://sandbox.safaricom.co.ke",
    });
}
catch (error) {
    sandboxPaymentRejected =
        error instanceof Error &&
            error.message.includes("must not use the Daraja sandbox");
}
assert(sandboxPaymentRejected, "Production payment mode must reject the Daraja sandbox URL.");
let paymentFieldsRequired = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        REQUIRE_PAYMENT: "true",
    });
}
catch (error) {
    paymentFieldsRequired =
        error instanceof Error && error.message.includes("MPESA_CONSUMER_KEY");
}
assert(paymentFieldsRequired, "Enabled production payments must require all Daraja configuration.");
let partialTelegramConfigRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        TELEGRAM_BOT_TOKEN: "test",
    });
}
catch (error) {
    partialTelegramConfigRejected =
        error instanceof Error &&
            error.message.includes("must be configured together");
}
assert(partialTelegramConfigRejected, "Production must reject partial Telegram configuration.");
let weakTelegramSecretRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        TELEGRAM_BOT_TOKEN: "test",
        TELEGRAM_WEBHOOK_SECRET: "short",
        TELEGRAM_WEBHOOK_URL: "https://example.test/webhook/telegram",
    });
}
catch (error) {
    weakTelegramSecretRejected =
        error instanceof Error &&
            error.message.includes("TELEGRAM_WEBHOOK_SECRET");
}
assert(weakTelegramSecretRejected, "Production Telegram webhooks must require a strong secret.");
let missingTelegramUrlRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        TELEGRAM_BOT_TOKEN: "test",
        TELEGRAM_WEBHOOK_SECRET: "a".repeat(32),
    });
}
catch (error) {
    missingTelegramUrlRejected =
        error instanceof Error &&
            error.message.includes("TELEGRAM_WEBHOOK_URL");
}
assert(missingTelegramUrlRejected, "Production Telegram must require the hosted HTTPS webhook URL.");
let insecureTelegramUrlRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        TELEGRAM_BOT_TOKEN: "test",
        TELEGRAM_WEBHOOK_SECRET: "a".repeat(32),
        TELEGRAM_WEBHOOK_URL: "http://example.test/webhook/telegram",
    });
}
catch (error) {
    insecureTelegramUrlRejected =
        error instanceof Error &&
            error.message.includes("TELEGRAM_WEBHOOK_URL");
}
assert(insecureTelegramUrlRejected, "Production Telegram webhook URLs must use HTTPS.");
(0, environment_1.validateProductionEnvironment)({
    ...base,
    TELEGRAM_BOT_TOKEN: "test",
    TELEGRAM_WEBHOOK_SECRET: "a".repeat(32),
    TELEGRAM_WEBHOOK_URL: "https://shauri.example.com/webhook/telegram",
});
let insecureOperatorDashboardRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        OPERATOR_DASHBOARD_URL: "http://shauri.example.com/internal/human/dashboard",
    });
}
catch (error) {
    insecureOperatorDashboardRejected =
        error instanceof Error &&
            error.message.includes("OPERATOR_DASHBOARD_URL");
}
assert(insecureOperatorDashboardRejected, "Production operator desk links must use HTTPS.");
let insecurePaOriginRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        PA_ALLOWED_ORIGINS: "http://pa.example.com",
    });
}
catch (error) {
    insecurePaOriginRejected =
        error instanceof Error && error.message.includes("PA_ALLOWED_ORIGINS");
}
assert(insecurePaOriginRejected, "Production PA origins must use HTTPS.");
let weakPaSecretRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        PA_SESSION_SECRET: "short",
    });
}
catch (error) {
    weakPaSecretRejected =
        error instanceof Error && error.message.includes("PA_SESSION_SECRET");
}
assert(weakPaSecretRejected, "Production PA sessions must require a strong secret.");
(0, environment_1.validateProductionEnvironment)({
    ...base,
    OPERATOR_WHATSAPP_PHONE: undefined,
    TELEGRAM_BOT_TOKEN: "test",
    TELEGRAM_WEBHOOK_SECRET: "a".repeat(32),
    TELEGRAM_WEBHOOK_URL: "https://shauri.example.com/webhook/telegram",
    TELEGRAM_OPERATOR_SETUP_CODE: "a".repeat(32),
});
let missingOperatorChannelRejected = false;
try {
    (0, environment_1.validateProductionEnvironment)({
        ...base,
        OPERATOR_WHATSAPP_PHONE: undefined,
    });
}
catch (error) {
    missingOperatorChannelRejected =
        error instanceof Error &&
            error.message.includes("OPERATOR_WHATSAPP_PHONE or Telegram operator setup");
}
assert(missingOperatorChannelRejected, "Production must require a configured operator notification channel.");
(0, environment_1.validateProductionEnvironment)({ NODE_ENV: "development" });
console.log("✓ production requires integration configuration and a strong operator token");
console.log("✓ live production payment mode cannot use Daraja sandbox");
console.log("✓ optional Telegram production configuration must be complete and use a strong secret");
console.log("✓ non-production development configuration remains optional");
console.log("ENVIRONMENT CONTRACT TEST PASSED");
