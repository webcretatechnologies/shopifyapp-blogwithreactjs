import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("--- Subscription Plans ---");
  const plans = await prisma.subscriptionPlan.findMany();
  console.log(JSON.stringify(plans, null, 2));

  console.log("--- Shops ---");
  const shops = await prisma.shop.findMany();
  console.log(JSON.stringify(shops, null, 2));

  console.log("--- App Plans ---");
  const appPlans = await prisma.appPlan.findMany();
  console.log(JSON.stringify(appPlans, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
