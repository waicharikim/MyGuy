import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const shauri = await prisma.agent.upsert({ where: { name: "shauri" }, update: {}, create: { name: "shauri", description: "Persistent decision-support engine" } });
  for (const [name, description] of [["decision_support", "Structured decision reasoning"], ["grounding", "External evidence retrieval"], ["human_query", "Request information from a human"]]) {
    await prisma.agentCapability.upsert({ where: { agentId_name: { agentId: shauri.id, name } }, update: { description, enabled: true }, create: { agentId: shauri.id, name, description } });
  }
}
main().finally(() => prisma.$disconnect());
