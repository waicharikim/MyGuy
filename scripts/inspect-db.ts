import "dotenv/config";
import { prisma } from "../src/infrastructure/prisma";

async function main() {
  const threads = await prisma.thread.findMany({ orderBy: { updatedAt: "desc" }, take: 5 });
  const humanQueries = await prisma.humanQuery.findMany({ orderBy: { createdAt: "desc" }, take: 10 });

  console.log(JSON.stringify({ threads, humanQueries }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
