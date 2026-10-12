-- Update the three standard one-time AI-credit packs. Existing purchase rows keep their own
-- price/credit snapshots, so this only affects future Shopify purchases.
UPDATE `AiCreditPack` SET `credits` = 5, `price` = 4.99, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `key` = 'small';

UPDATE `AiCreditPack` SET `credits` = 20, `price` = 9.99, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `key` = 'medium';

UPDATE `AiCreditPack` SET `credits` = 50, `price` = 19.99, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `key` = 'large';
