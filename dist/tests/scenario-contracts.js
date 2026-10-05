"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const root = node_path_1.default.resolve(__dirname, "..");
function has(file, text) {
    const content = node_fs_1.default.readFileSync(node_path_1.default.join(root, file), "utf8");
    if (!content.includes(text))
        throw new Error(`${file} is missing required contract: ${text}`);
}
has("prisma/schema.prisma", "externalId String?");
has("prisma/schema.prisma", "model GroundingEvidence");
has("prisma/schema.prisma", "model HumanQuery");
has("prisma/schema.prisma", "model Escalation");
has("prisma/schema.prisma", "model KnowledgeCandidate");
has("src/application/thread-resolver.ts", "type: \"ambiguous\"");
has("src/domain/thread.ts", "Cannot close");
has("src/whatsapp/webhook.controller.ts", "timingSafeEqual");
has("src/agent/graph.ts", "buildShauriGraph");
has("src/agent/graph.ts", "groundingClaims");
has("src/agent/human-query.ts", "tx.knowledgeCandidate.create");
has("src/tools/schedule_followup.ts", "idempotencyKey");
has("src/payments/mpesa-callback.controller.ts", "already processed");
console.log("Shauri architecture contract checks passed.");
