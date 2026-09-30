"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatModel = getChatModel;
exports.getFastModel = getFastModel;
const anthropic_1 = require("@langchain/anthropic");
const openai_1 = require("@langchain/openai");
const aws_1 = require("@langchain/aws");
// Lightweight mock model for offline smoke tests. Enabled when
// `MOCK_LLM=true` is present in the environment. It implements a
// minimal `invoke(messages)` surface used by the graph runner.
class MockModel {
    fast;
    lastUserContent = null;
    constructor(fast = false) {
        this.fast = fast;
    }
    async invoke(messages) {
        const system = messages.find((m) => m.role === "system")?.content || "";
        // Record any user content seen so later passes (ground) can inspect it.
        const anyUser = messages.find((m) => m.role === "user")?.content;
        if (anyUser)
            this.lastUserContent = String(anyUser);
        // Grounding-specific prompt: return a non-empty claims array when the
        // most recent user content contains obvious checkable claims (used by
        // smoke tests to exercise the HumanQuery creation path), otherwise
        // return an empty array.
        if (/consequential factual claims/i.test(system) || /Extract only consequential factual claims/i.test(system)) {
            const look = (this.lastUserContent || "").toLowerCase();
            if (look.includes("sacco") || look.includes("20%") || look.includes("20 percent")) {
                return { content: JSON.stringify([`Does the SACCO claim of 20% annual returns hold for the user's savings amount?`]) };
            }
            return { content: JSON.stringify([]) };
        }
        // Provide deterministic, safe JSON for the graph passes the smoke
        // scripts exercise.
        if (/Intake/i.test(system)) {
            return {
                content: JSON.stringify({
                    needsClarification: false,
                    question: "",
                    known: [],
                    open: [],
                    decisionSummary: "",
                    informationNeeds: [],
                }),
            };
        }
        if (/Skeptic/i.test(system)) {
            return {
                content: JSON.stringify({
                    leaning: "",
                    argument: "",
                    risks: [],
                    decisionChangingFacts: [],
                }),
            };
        }
        if (/Close/i.test(system)) {
            return { content: JSON.stringify({ nextAction: "No action", escalate: false, resolved: false, humanQuery: false, decisionSummary: "" }) };
        }
        // Fallback: echo the user's content or return a short reply.
        const user = messages.find((m) => m.role === "user")?.content || "";
        return { content: String(user).slice(0, 200) || "OK" };
    }
}
/**
 * Single point of model configuration. Every pass/router call goes
 * through here instead of instantiating a model directly — this is
 * what makes it a one-line swap between providers.
 *
 * Priority order: ANTHROPIC_API_KEY > DASHSCOPE_API_KEY > NEBIUS_API_KEY.
 * DashScope sits above Nebius because it's a known-working key already
 * in use on UJAMAA_DAO (migrated off Anthropic there already) — reusing
 * it here is zero new signup. Nebius stays as the fallback since its
 * free credit is still there if DashScope isn't set.
 */
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL ??
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
function getChatModel(temperature = 0.3) {
    if (process.env.MOCK_LLM === "true" || process.env.MOCK_LLM === "1") {
        return new MockModel(false);
    }
    // NOTE: LangSmith is a tracing/observability platform, not an LLM
    // provider — a prior version of this file mistakenly treated
    // LANGSMITH_API_KEY as a model to call against a made-up endpoint
    // (https://api.langsmith.ai/v1), which silently intercepted every
    // request and returned a plain-text 404 (this was the actual cause
    // of the "404 404 page not found" error during smoke testing — NOT
    // a DashScope problem). Tracing is enabled correctly just by setting
    // LANGSMITH_API_KEY / LANGSMITH_TRACING=true / LANGSMITH_PROJECT —
    // LangChain's SDK picks these up automatically for every real model
    // call below; no separate "LangSmith model" branch is needed or
    // should exist.
    if (process.env.ANTHROPIC_API_KEY) {
        return new anthropic_1.ChatAnthropic({ model: "claude-sonnet-4-6", temperature });
    }
    if (process.env.AWS_BEDROCK_MODEL_ID) {
        return new aws_1.ChatBedrockConverse({
            model: process.env.AWS_BEDROCK_MODEL_ID,
            region: process.env.AWS_REGION ?? "us-east-1",
            temperature,
            // Credentials resolve via the standard AWS SDK chain — explicit
            // AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in .env, a shared
            // credentials file, or an instance role if deployed on AWS.
        });
    }
    if (process.env.DASHSCOPE_API_KEY) {
        return new openai_1.ChatOpenAI({
            apiKey: process.env.DASHSCOPE_API_KEY,
            model: process.env.DASHSCOPE_MODEL ?? "qwen-plus",
            temperature,
            configuration: { baseURL: DASHSCOPE_BASE_URL },
        });
    }
    if (process.env.NEBIUS_API_KEY) {
        return new openai_1.ChatOpenAI({
            apiKey: process.env.NEBIUS_API_KEY,
            model: process.env.NEBIUS_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct",
            temperature,
            configuration: { baseURL: "https://api.tokenfactory.nebius.com/v1/" },
        });
    }
    throw new Error("No LLM provider configured — set AWS_BEDROCK_MODEL_ID (+ AWS credentials), DASHSCOPE_API_KEY, NEBIUS_API_KEY, or ANTHROPIC_API_KEY in .env");
}
/**
 * Cheaper/faster model for lightweight classification work (intent
 * routing, thread disambiguation, connection detection).
 */
function getFastModel(temperature = 0) {
    if (process.env.MOCK_LLM === "true" || process.env.MOCK_LLM === "1") {
        return new MockModel(true);
    }
    if (process.env.ANTHROPIC_API_KEY) {
        return new anthropic_1.ChatAnthropic({ model: "claude-haiku-4-5", temperature });
    }
    if (process.env.AWS_BEDROCK_FAST_MODEL_ID || process.env.AWS_BEDROCK_MODEL_ID) {
        return new aws_1.ChatBedrockConverse({
            model: process.env.AWS_BEDROCK_FAST_MODEL_ID ?? process.env.AWS_BEDROCK_MODEL_ID,
            region: process.env.AWS_REGION ?? "us-east-1",
            temperature,
        });
    }
    if (process.env.DASHSCOPE_API_KEY) {
        return new openai_1.ChatOpenAI({
            apiKey: process.env.DASHSCOPE_API_KEY,
            model: process.env.DASHSCOPE_FAST_MODEL ?? "qwen-turbo",
            temperature,
            configuration: { baseURL: DASHSCOPE_BASE_URL },
        });
    }
    if (process.env.NEBIUS_API_KEY) {
        return new openai_1.ChatOpenAI({
            apiKey: process.env.NEBIUS_API_KEY,
            model: process.env.NEBIUS_FAST_MODEL ?? "openai/gpt-oss-20b",
            temperature,
            configuration: { baseURL: "https://api.tokenfactory.nebius.com/v1/" },
        });
    }
    throw new Error("No LLM provider configured — set AWS_BEDROCK_MODEL_ID (+ AWS credentials), DASHSCOPE_API_KEY, NEBIUS_API_KEY, or ANTHROPIC_API_KEY in .env");
}
