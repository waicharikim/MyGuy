"use strict";
// Minimal LangSmith gateway HTTP wrapper.
// Uses `fetch` to call the LangSmith system-one endpoint.
Object.defineProperty(exports, "__esModule", { value: true });
exports.callLangSmithSystemOne = callLangSmithSystemOne;
async function callLangSmithSystemOne(opts) {
    const base = opts.baseURL ?? process.env.LANGSMITH_BASE_URL ?? "https://gateway.smith.langchain.com";
    const apiKey = opts.apiKey ?? process.env.LANGSMITH_API_KEY;
    if (!apiKey)
        throw new Error("LANGSMITH_API_KEY is required for LangSmith gateway calls");
    const url = `${base.replace(/\/$/, "")}/v1/system-one`;
    const body = { model: opts.model, state: opts.state };
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`LangSmith call failed ${res.status}: ${text}`);
    }
    const data = (await res.json());
    return data;
}
