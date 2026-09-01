-- Sellable AI-credit top-up packs, now Super Admin-configurable instead of a static in-code table.
CREATE TABLE `AiCreditPack` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(191) NOT NULL,
  `credits` INTEGER NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `AiCreditPack_key_key`(`key`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the same three packs that were previously hardcoded in AiCreditPackService.js, so existing
-- AiCreditPurchase rows (packKey: "small"/"medium"/"large") keep resolving to a real pack.
INSERT INTO `AiCreditPack` (`key`, `credits`, `price`, `currency`, `isActive`, `sortOrder`, `updatedAt`) VALUES
  ('small', 10, 4.99, 'USD', true, 1, CURRENT_TIMESTAMP(3)),
  ('medium', 25, 9.99, 'USD', true, 2, CURRENT_TIMESTAMP(3)),
  ('large', 60, 19.99, 'USD', true, 3, CURRENT_TIMESTAMP(3));
