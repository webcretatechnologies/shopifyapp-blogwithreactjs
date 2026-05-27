import { prisma } from "../shopify.js";

async function main() {
  const shops = await prisma.shop.findMany();
  console.log(`Found ${shops.length} shops.`);
  for (const s of shops) {
    console.log({
      id: s.id,
      domain: s.domain,
      planKey: s.planKey,
      tokenSample: s.accessToken.substring(0, 15) + "..."
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
