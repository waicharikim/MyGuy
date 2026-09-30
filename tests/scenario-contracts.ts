import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
function has(file: string, text: string) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (!content.includes(text)) throw new Error(`${file} is missing required contract: ${text}`);
}

has("prisma/schema.prisma", "externalId  String?");
has("prisma/schema.prisma", "model GroundingEvidence");
has("prisma/schema.prisma", "model HumanQuery");
has("prisma/schema.prisma", "model Escalation");
has("prisma/schema.prisma", "model KnowledgeCandidate");
has("src/application/thread-resolver.ts", "type: \"ambiguous\"");
has("src/domain/thread.ts", "Cannot close");
has("src/whatsapp/webhook.controller.ts", "timingSafeEqual");
has("src/agent/graph.ts", "buildShauriGraph");
has("src/agent/graph.ts", "groundingClaims");
has("src/agent/human-query.ts", "promoteHumanAnswerToCandidate");
has("src/tools/schedule_followup.ts", "idempotencyKey");
has("src/payments/mpesa-callback.controller.ts", "already processed");
console.log("Shauri architecture contract checks passed.");
