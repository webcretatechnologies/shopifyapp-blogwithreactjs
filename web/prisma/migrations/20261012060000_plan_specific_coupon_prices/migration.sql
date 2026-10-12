ALTER TABLE `Coupon` ADD COLUMN `planPrices` JSON NULL;

-- First fifty approved stores may claim one month at the promotional price.
INSERT IGNORE INTO `Coupon`
  (`code`, `discountType`, `percentOff`, `amountOff`, `planPrices`, `durationMonths`, `description`, `active`, `totalUses`, `usesPerStore`, `appliesTo`, `createdAt`, `updatedAt`)
VALUES
  ('FIRST50', 'FIXED_PRICE', NULL, NULL, JSON_OBJECT('Starter Plan', 9.99, 'Pro Plan', 19.99), 1,
   'First 50 stores: Starter $9.99 or Pro $19.99 for the first month.', true, 50, 1, 'SPECIFIC_PLANS', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO `CouponPlan` (`couponId`, `planId`)
SELECT c.id, p.id FROM `Coupon` c JOIN `SubscriptionPlan` p ON p.name IN ('Starter Plan', 'Pro Plan')
WHERE c.code = 'FIRST50';
