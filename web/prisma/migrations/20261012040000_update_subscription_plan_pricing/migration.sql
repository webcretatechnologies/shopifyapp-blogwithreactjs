-- Update the published subscription prices. Existing Shopify AppSubscription charges are
-- unaffected: Shopify keeps their approved amount until the merchant changes or renews it.
UPDATE `SubscriptionPlan` SET `price` = 14.99, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `name` = 'Starter Plan';

UPDATE `SubscriptionPlan` SET `price` = 99.99, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `name` = 'Starter Plan Annual';

UPDATE `SubscriptionPlan` SET `price` = 29.99, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `name` = 'Pro Plan';

UPDATE `SubscriptionPlan` SET `price` = 199.99, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `name` = 'Pro Plan Annual';
