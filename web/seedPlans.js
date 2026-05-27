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
    },
    {
      name: "Blogger Starter Annual",
      title: "Starter",
      price: 39.99,
      interval: "ANNUAL",
      description: "Perfect for growing blogs (billed annually).",
      features: ["Up to 50 articles", "Premium templates", "Priority support", "No branding"],
      sortOrder: 5,
    },
    {
      name: "Blogger Pro Annual",
      title: "Pro",
      price: 79.99,
      interval: "ANNUAL",
      description: "For professional content creators (billed annually).",
      features: ["Unlimited articles", "All templates", "24/7 support", "Custom CSS/JS"],
      sortOrder: 6,
    },
    {
      name: "Blogger Business Annual",
      title: "Business",
      price: 159.99,
      interval: "ANNUAL",
      description: "Advanced features for enterprises (billed annually).",
      features: ["Unlimited everything", "Dedicated account manager", "White-glove onboarding"],
      sortOrder: 7,
    }
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: plan, // Sync changes if they exist
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
