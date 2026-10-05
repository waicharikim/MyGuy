"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProductionEnvironment = validateProductionEnvironment;
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
        "OPERATOR_WHATSAPP_PHONE",
    ];
    const missing = required.filter((name) => !env[name]?.trim());
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
