import "dotenv/config";
import { getChatModel } from "../src/agent/model";

async function main() {
  const model = getChatModel();

  const intake = await model.invoke([
    { role: "system", content: "You are Shauri's Intake pass. Extract." },
    { role: "user", content: "A SACCO in Kiambu is promising 20% annual returns if I invest my savings with them." },
  ]);

  console.log('INTAKE RESPONSE:', intake.content);

  const ground = await model.invoke([
    { role: "system", content: "Extract only consequential factual claims or uncertainties that could materially change this decision and should be externally verified. Return ONLY JSON array of short claims. If none, return []." },
    { role: "user", content: "A SACCO in Kiambu is promising 20% annual returns if I invest my savings with them." },
  ]);

  console.log('GROUND RESPONSE:', ground.content);
}

main().catch((e) => { console.error(e); process.exit(1); });
