import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      name: "free",
      title: "Free",
      price: 0.00,
      description: "Basic features to get started.",
      features: ["Up to 10 articles", "Standard templates", "Basic support"],
      sortOrder: 1,
    },
    {
      name: "Blogger Starter",
      title: "Starter",
      price: 4.99,
      description: "Perfect for growing blogs.",
      features: ["Up to 50 articles", "Premium templates", "Priority support", "No branding"],
      sortOrder: 2,
    },
    {
      name: "Blogger Pro",
      title: "Pro",
      price: 9.99,
      description: "For professional content creators.",
      features: ["Unlimited articles", "All templates", "24/7 support", "Custom CSS/JS"],
      sortOrder: 3,
    },
    {
      name: "Blogger Business",
      title: "Business",
      price: 19.99,
      description: "Advanced features for enterprises.",
      features: ["Unlimited everything", "Dedicated account manager", "White-glove onboarding"],
      sortOrder: 4,
    }
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {}, // Do not overwrite if it already exists
      create: plan,
    });
  }

  // Also seed the billing test mode setting
  await prisma.adminSetting.upsert({
    where: { key: "billing_test_mode" },
    update: {},
    create: { key: "billing_test_mode", value: "true" },
  });

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
