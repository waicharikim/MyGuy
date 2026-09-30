// Minimal LangSmith gateway HTTP wrapper.
// Uses `fetch` to call the LangSmith system-one endpoint.

interface LangSmithResponse {
  // Adapt to the fields you expect; keep it loose for now.
  output?: any;
  questions?: Record<string, any>;
  [k: string]: any;
}

export async function callLangSmithSystemOne(opts: { model: string; state: string; baseURL?: string; apiKey?: string; }) {
  const base = opts.baseURL ?? process.env.LANGSMITH_BASE_URL ?? "https://gateway.smith.langchain.com";
  const apiKey = opts.apiKey ?? process.env.LANGSMITH_API_KEY;
  if (!apiKey) throw new Error("LANGSMITH_API_KEY is required for LangSmith gateway calls");

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

  const data = (await res.json()) as LangSmithResponse;
  return data;
}
