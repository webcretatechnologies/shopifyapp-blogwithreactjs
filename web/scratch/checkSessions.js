import { prisma } from "../shopify.js";

async function main() {
  const sessions = await prisma.session.findMany();
  console.log(`Found ${sessions.length} sessions.`);
  for (const s of sessions) {
    console.log({
      id: s.id,
      shop: s.shop,
      state: s.state,
      isOnline: s.isOnline,
      scope: s.scope,
      expires: s.expires
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
