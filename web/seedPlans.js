import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // `features` is intentionally left empty — the merchant billing page no longer reads this
  // column at all (GET /api/billing/plans overrides it with live bullets built from the real
  // PlanFeature gating data, see PlanFeatureService.buildTieredPlanFeatures). Keeping stale
  // hardcoded copy here would just be misleading dead data.
  const plans = [
    {
      name: "free",
      title: "Free",
      price: 0.00,
      description: "Perfect for getting started",
      features: [],
      sortOrder: 1,
    },
    {
      name: "Blogger Starter",
      title: "Starter",
      price: 4.99,
      description: "Built for growing stores",
      features: [],
      sortOrder: 2,
    },
    {
      name: "Blogger Pro",
      title: "Pro",
      price: 9.99,
      description: "For professional content creators",
      features: [],
      sortOrder: 3,
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan, // Sync changes if they exist
      create: plan,
    });
  }

  console.log("Seeding completed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
