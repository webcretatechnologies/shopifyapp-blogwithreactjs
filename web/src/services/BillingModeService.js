import { prisma } from "../../shopify.js";

export const BILLING_MODE_KEYS = {
  subscription: "billing_subscription_test_mode",
  oneTime: "billing_one_time_test_mode",
};

export async function isBillingTestMode(kind) {
  const key = BILLING_MODE_KEYS[kind];
  const setting = key ? await prisma.adminSetting.findUnique({ where: { key } }) : null;
  // Safe default while the setting has not yet been configured.
  return setting ? setting.value === "true" : true;
}
