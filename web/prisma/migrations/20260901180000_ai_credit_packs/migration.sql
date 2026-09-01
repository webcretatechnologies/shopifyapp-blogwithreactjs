-- Extra AI generations bought on top of the plan's own ai_credits allowance, via one-time
-- AppPurchaseOneTime credit packs. Added to the plan limit when checking remaining room.
ALTER TABLE `Shop` ADD COLUMN `aiCreditsPurchased` INTEGER NOT NULL DEFAULT 0;

-- One AI-credit top-up purchase (Shopify AppPurchaseOneTime charge, not a subscription).
CREATE TABLE `AiCreditPurchase` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shopId` INTEGER NOT NULL,
  `packKey` VARCHAR(191) NOT NULL,
  `credits` INTEGER NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  `currencyCode` VARCHAR(10) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  `shopifyPurchaseId` VARCHAR(191) NOT NULL,
  `test` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AiCreditPurchase_shopifyPurchaseId_key`(`shopifyPurchaseId`),
  INDEX `AiCreditPurchase_shopId_idx`(`shopId`),
  INDEX `AiCreditPurchase_shopId_status_idx`(`shopId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AiCreditPurchase` ADD CONSTRAINT `AiCreditPurchase_shopId_fkey`
  FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
