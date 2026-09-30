const { BedrockClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock");

// ...existing code...
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
  return chunks.join("");
}

function parseOrText(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed.output) return parsed.output;
    if (parsed.outputs && Array.isArray(parsed.outputs)) return JSON.stringify(parsed.outputs);
    if (parsed.results && Array.isArray(parsed.results)) return JSON.stringify(parsed.results);
    if (parsed.message) return JSON.stringify(parsed.message);
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

(async () => {
  try {
    const { BedrockClient, InvokeModelCommand } = await import("@aws-sdk/client-bedrock");
    const region = process.env.AWS_REGION || "us-west-2";
    const model = process.env.BEDROCK_MODEL_ID;
    if (!model) throw new Error("BEDROCK_MODEL_ID not set");

    const client = new BedrockClient({ region });

    const useConverse = String(model).includes("inference-profile") || process.env.BEDROCK_USE_CONVERSE === "true";
    let bodyObj;
    const prompt = process.env.BEDROCK_PROMPT || "ping";

    if (useConverse) {
      bodyObj = {
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 512 },
      };
    } else {
      bodyObj = { input: prompt };
    }

    const cmd = new InvokeModelCommand({
      modelId: model,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(bodyObj),
    });

    const res = await client.send(cmd);
    const body = await streamToString(res.body);
    console.log("status:", res.$metadata?.httpStatusCode || "unknown");
    console.log("raw:", body);
    console.log("parsed:", parseOrText(body));
  } catch (err) {
    console.error("error:", err && err.message ? err.message : err);
    process.exit(1);
  }
})();
// ...existing code...