-- Makes the "Recommended" plan badge and the credit-pack "Best value" badge Super Admin-editable
-- instead of hardcoded client-side logic.
ALTER TABLE `SubscriptionPlan` ADD COLUMN `isRecommended` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `AiCreditPack` ADD COLUMN `isRecommended` BOOLEAN NOT NULL DEFAULT false;

-- Preserve current visible behaviour on upgrade: the plan that was previously auto-flagged
-- "Recommended" (highest price among active plans) keeps showing the badge until an admin
-- changes it, instead of the badge silently disappearing everywhere.
UPDATE `SubscriptionPlan` SET `isRecommended` = true
WHERE `id` = (
  SELECT id FROM (
    SELECT `id` FROM `SubscriptionPlan` WHERE `isActive` = true ORDER BY `price` DESC LIMIT 1
  ) AS t
);

-- Same preservation for credit packs: the pack that was previously auto-flagged "Best value"
-- (lowest price-per-credit among active packs) keeps the badge.
UPDATE `AiCreditPack` SET `isRecommended` = true
WHERE `id` = (
  SELECT id FROM (
    SELECT `id` FROM `AiCreditPack` WHERE `isActive` = true ORDER BY (`price` / `credits`) ASC LIMIT 1
  ) AS t
);
