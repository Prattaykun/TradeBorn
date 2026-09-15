import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const r = await prisma.$queryRaw`SELECT 1::int as ok`;
  console.log("db ok", r);
}

main()
  .catch((e) => {
    console.error("db fail:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
