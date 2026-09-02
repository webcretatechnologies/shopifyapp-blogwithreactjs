/**
 * Fresh-deploy seeder — the single source of truth for every row a brand-new install needs
 * before the app is usable (billing plans, plan feature gating, AI credit packs, Super Admin).
 *
 * This is wired into the deploy path (`npm run setup`, which the Docker CMD runs before
 * `npm run serve`), so a fresh server comes up with the same Plans & Billing configuration we
 * develop against instead of an empty Super Admin pricing page. Anything we change about default
 * pricing/packaging belongs HERE — not in a one-off script that nobody remembers to run.
 *
 * Idempotent and non-destructive by default: rows that already exist are left alone, so a
 * redeploy never clobbers pricing a Super Admin edited in the live admin panel. Run with
 * `--force` (or SEED_FORCE=1) to push the defaults below back over existing rows.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  upsertPlanFeaturesFromDefaults,
  refreshPlanFeaturesCache,
} from "../src/services/PlanFeatureService.js";

const prisma = new PrismaClient();

const FORCE =
  process.argv.includes("--force") || process.env.SEED_FORCE === "1";

// `features` is intentionally left empty — the merchant billing page no longer reads this
// column at all (GET /api/billing/plans overrides it with live bullets built from the real
// PlanFeature gating data, see PlanFeatureService.buildTieredPlanFeatures). Keeping stale
// hardcoded copy here would just be misleading dead data.
//
// `name` is the plan key the whole app matches on (PlanFeatureService.getFeaturesForPlan does a
// substring match for "starter"/"pro"/"business"), so renaming one of these renames the tier.
const SUBSCRIPTION_PLANS = [
  {
    name: "free",
    title: "Free",
    price: 0.0,
    currency: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 0,
    description: "Perfect for getting started",
    features: [],
    isActive: true,
    isRecommended: false,
    sortOrder: 1,
  },
  {
    name: "Starter Plan",
    title: "Starter",
    price: 19.99,
    currency: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 0,
    description: "Built for growing stores",
    features: [],
    isActive: true,
    isRecommended: false,
    sortOrder: 2,
  },
  {
    name: "Pro Plan",
    title: "Pro",
    price: 39.99,
    currency: "USD",
    interval: "EVERY_30_DAYS",
    trialDays: 0,
    description: "For professional content creators",
    features: [],
    isActive: true,
    isRecommended: false,
    sortOrder: 3,
  },
];

// Mirrors the defaults the AiCreditPack migration inserts. Repeated here so a database that was
// created by `prisma db push` (or one where the packs were deleted) still ends up with them.
const AI_CREDIT_PACKS = [
  { key: "small", credits: 10, price: 4.99, currency: "USD", isActive: true, isRecommended: false, sortOrder: 1 },
  { key: "medium", credits: 25, price: 9.99, currency: "USD", isActive: true, isRecommended: false, sortOrder: 2 },
  { key: "large", credits: 60, price: 19.99, currency: "USD", isActive: true, isRecommended: true, sortOrder: 3 },
];

async function seedSubscriptionPlans() {
  let created = 0;
  let updated = 0;
  for (const plan of SUBSCRIPTION_PLANS) {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { name: plan.name },
    });
    if (!existing) {
      await prisma.subscriptionPlan.create({ data: plan });
      created++;
    } else if (FORCE) {
      await prisma.subscriptionPlan.update({ where: { name: plan.name }, data: plan });
      updated++;
    }
  }
  console.log(
    `  Subscription plans: ${created} created, ${updated} overwritten, ` +
      `${SUBSCRIPTION_PLANS.length - created - updated} left as-is.`
  );
}

async function seedAiCreditPacks() {
  let created = 0;
  let updated = 0;
  for (const pack of AI_CREDIT_PACKS) {
    const existing = await prisma.aiCreditPack.findUnique({ where: { key: pack.key } });
    if (!existing) {
      await prisma.aiCreditPack.create({ data: pack });
      created++;
    } else if (FORCE) {
      await prisma.aiCreditPack.update({ where: { key: pack.key }, data: pack });
      updated++;
    }
  }
  console.log(
    `  AI credit packs: ${created} created, ${updated} overwritten, ` +
      `${AI_CREDIT_PACKS.length - created - updated} left as-is.`
  );
}

async function seedPlanFeatures() {
  // Creates any missing PlanFeature row and re-applies the keys whose tier placement changed in
  // code. The app also does this on boot, but doing it here means a fresh DB is fully configured
  // before the server ever accepts a request.
  await upsertPlanFeaturesFromDefaults({
    overwriteKeys: ["blog_sidebar", "listing_layout"],
  });
  await refreshPlanFeaturesCache();
  const count = await prisma.planFeature.count();
  console.log(`  Plan features: ${count} rows in sync.`);
}

async function seedSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL || "admin@webcreta.com";
  const plainPassword = process.env.SUPER_ADMIN_PASSWORD || "webcreta@#7707";

  const existing = await prisma.superAdmin.findUnique({ where: { email } });
  if (existing && !FORCE) {
    console.log(`  Super Admin: ${email} already exists (password left untouched).`);
    return;
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 10);
  await prisma.superAdmin.upsert({
    where: { email },
    update: { password: hashedPassword },
    create: { email, password: hashedPassword, name: "Master Admin" },
  });
  console.log(`  Super Admin: ${email} ${existing ? "password reset" : "created"}.`);
}

async function main() {
  console.log(`Seeding default data${FORCE ? " (--force: existing rows will be overwritten)" : ""}...`);
  await seedSubscriptionPlans();
  await seedPlanFeatures();
  await seedAiCreditPacks();
  await seedSuperAdmin();
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
