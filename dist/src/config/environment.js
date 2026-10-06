"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProductionEnvironment = validateProductionEnvironment;
const webhook_config_1 = require("../telegram/webhook-config");
function validateProductionEnvironment(env) {
    if (env.NODE_ENV !== "production") {
        return;
    }
    const required = [
        "DATABASE_URL",
        "REDIS_HOST",
        "TAVILY_API_KEY",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_TOKEN",
        "WHATSAPP_APP_SECRET",
        "WHATSAPP_VERIFY_TOKEN",
        "PA_SESSION_SECRET",
        "PA_ALLOWED_ORIGINS",
    ];
    const missing = required.filter((name) => !env[name]?.trim());
    const hasTelegramOperatorSetup = Boolean(env.TELEGRAM_BOT_TOKEN?.trim()) &&
        Boolean(env.TELEGRAM_OPERATOR_SETUP_CODE?.trim());
    if (!env.OPERATOR_WHATSAPP_PHONE?.trim() && !hasTelegramOperatorSetup) {
        missing.push("OPERATOR_WHATSAPP_PHONE or Telegram operator setup (TELEGRAM_BOT_TOKEN and TELEGRAM_OPERATOR_SETUP_CODE)");
    }
    if (Boolean(env.TELEGRAM_BOT_TOKEN?.trim()) !== Boolean(env.TELEGRAM_WEBHOOK_SECRET?.trim())) {
        missing.push("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be configured together");
    }
    if (env.TELEGRAM_WEBHOOK_SECRET?.trim() &&
        env.TELEGRAM_WEBHOOK_SECRET.trim().length < 32) {
        missing.push("TELEGRAM_WEBHOOK_SECRET (at least 32 characters)");
    }
    if (env.TELEGRAM_OPERATOR_SETUP_CODE?.trim() &&
        env.TELEGRAM_OPERATOR_SETUP_CODE.trim().length < 32) {
        missing.push("TELEGRAM_OPERATOR_SETUP_CODE (at least 32 characters)");
    }
    if (env.TELEGRAM_BOT_TOKEN?.trim() &&
        !(0, webhook_config_1.isTelegramWebhookUrl)(env.TELEGRAM_WEBHOOK_URL?.trim())) {
        missing.push("TELEGRAM_WEBHOOK_URL (HTTPS URL ending in /webhook/telegram)");
    }
    if (env.OPERATOR_DASHBOARD_URL?.trim()) {
        try {
            const dashboardUrl = new URL(env.OPERATOR_DASHBOARD_URL.trim());
            if (dashboardUrl.protocol !== "https:" ||
                dashboardUrl.pathname.replace(/\/$/, "") !==
                    "/internal/human/dashboard" ||
                dashboardUrl.username ||
                dashboardUrl.password ||
                dashboardUrl.search ||
                dashboardUrl.hash) {
                throw new Error();
            }
        }
        catch {
            missing.push("OPERATOR_DASHBOARD_URL (HTTPS URL ending in /internal/human/dashboard)");
        }
    }
    const hasModelProvider = [
        "ANTHROPIC_API_KEY",
        "AWS_BEDROCK_MODEL_ID",
        "DASHSCOPE_API_KEY",
        "NEBIUS_API_KEY",
    ].some((name) => Boolean(env[name]?.trim()));
    if (!hasModelProvider) {
        missing.push("one LLM provider (ANTHROPIC_API_KEY, AWS_BEDROCK_MODEL_ID, DASHSCOPE_API_KEY, or NEBIUS_API_KEY)");
    }
    if ((env.INTERNAL_OPERATOR_TOKEN?.trim().length ?? 0) < 32) {
        missing.push("INTERNAL_OPERATOR_TOKEN (at least 32 characters)");
    }
    if ((env.PA_SESSION_SECRET?.trim().length ?? 0) < 32) {
        missing.push("PA_SESSION_SECRET (at least 32 characters)");
    }
    if (env.PA_ALLOWED_ORIGINS?.trim()) {
        const origins = env.PA_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
        if (origins.some((origin) => {
            try {
                const url = new URL(origin);
                return (url.protocol !== "https:" ||
                    url.origin !== origin ||
                    url.username !== "" ||
                    url.password !== "");
            }
            catch {
                return true;
            }
        })) {
            missing.push("PA_ALLOWED_ORIGINS (comma-separated HTTPS origins without paths)");
        }
    }
    if (env.REQUIRE_PAYMENT === "true") {
        for (const name of [
            "MPESA_CONSUMER_KEY",
            "MPESA_CONSUMER_SECRET",
            "MPESA_SHORTCODE",
            "MPESA_PASSKEY",
            "MPESA_CALLBACK_URL",
        ]) {
            if (!env[name]?.trim()) {
                missing.push(name);
            }
        }
        if (!env.MPESA_BASE_URL?.trim()) {
            missing.push("MPESA_BASE_URL (use the production Daraja endpoint)");
        }
        else if (/sandbox\.safaricom\.co\.ke/i.test(env.MPESA_BASE_URL)) {
            missing.push("MPESA_BASE_URL must not use the Daraja sandbox in production");
        }
    }
    if (missing.length > 0) {
        throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
    }
}
