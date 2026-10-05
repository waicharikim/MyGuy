import { validateProductionEnvironment } from "../src/config/environment";

function assert(condition: unknown, message: string): asserts condition {
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
  ANTHROPIC_API_KEY: "test",
  REQUIRE_PAYMENT: "false",
};

validateProductionEnvironment(base);

let weakTokenRejected = false;
try {
  validateProductionEnvironment({
    ...base,
    INTERNAL_OPERATOR_TOKEN: "short",
  });
} catch (error) {
  weakTokenRejected =
    error instanceof Error &&
    error.message.includes("INTERNAL_OPERATOR_TOKEN");
}
assert(weakTokenRejected, "Production must reject a weak operator token.");

let missingProviderRejected = false;
try {
  validateProductionEnvironment({
    ...base,
    ANTHROPIC_API_KEY: undefined,
  });
} catch (error) {
  missingProviderRejected =
    error instanceof Error && error.message.includes("one LLM provider");
}
assert(missingProviderRejected, "Production must require an LLM provider.");

let sandboxPaymentRejected = false;
try {
  validateProductionEnvironment({
    ...base,
    REQUIRE_PAYMENT: "true",
    MPESA_CONSUMER_KEY: "test",
    MPESA_CONSUMER_SECRET: "test",
    MPESA_SHORTCODE: "test",
    MPESA_PASSKEY: "test",
    MPESA_CALLBACK_URL: "https://example.test/callback",
    MPESA_BASE_URL: "https://sandbox.safaricom.co.ke",
  });
} catch (error) {
  sandboxPaymentRejected =
    error instanceof Error &&
    error.message.includes("must not use the Daraja sandbox");
}
assert(sandboxPaymentRejected, "Production payment mode must reject the Daraja sandbox URL.");

let paymentFieldsRequired = false;
try {
  validateProductionEnvironment({
    ...base,
    REQUIRE_PAYMENT: "true",
  });
} catch (error) {
  paymentFieldsRequired =
    error instanceof Error && error.message.includes("MPESA_CONSUMER_KEY");
}
assert(paymentFieldsRequired, "Enabled production payments must require all Daraja configuration.");

validateProductionEnvironment({ NODE_ENV: "development" });
console.log("✓ production requires integration configuration and a strong operator token");
console.log("✓ live production payment mode cannot use Daraja sandbox");
console.log("✓ non-production development configuration remains optional");
console.log("ENVIRONMENT CONTRACT TEST PASSED");
