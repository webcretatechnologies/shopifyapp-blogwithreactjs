-- Backfills the billing tables that were only ever created by `prisma db push` during
-- development and therefore existed in no migration at all: a fresh `prisma migrate deploy`
-- died at 20260901210000_recommended_flags ("Table `SubscriptionPlan` doesn't exist"), which is
-- why a freshly deployed server came up with an empty Plans & Billing page.
--
-- `IF NOT EXISTS` keeps this a no-op on the development/production databases that already have
-- these tables from `db push`. Columns added by later migrations (SubscriptionPlan.isRecommended,
-- added by 20260901210000_recommended_flags) are deliberately NOT included here, so those
-- migrations still apply cleanly on top.

CREATE TABLE IF NOT EXISTS `SubscriptionPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `interval` VARCHAR(191) NOT NULL DEFAULT 'EVERY_30_DAYS',
    `trialDays` INTEGER NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `features` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SubscriptionPlan_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Coupon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `discountType` VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE',
    `percentOff` DECIMAL(5, 2) NULL,
    `amountOff` DECIMAL(10, 2) NULL,
    `durationMonths` INTEGER NOT NULL,
    `description` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `startsAt` DATETIME(3) NULL,
    `endsAt` DATETIME(3) NULL,
    `totalUses` INTEGER NULL,
    `usesPerStore` INTEGER NOT NULL DEFAULT 1,
    `appliesTo` VARCHAR(20) NOT NULL DEFAULT 'ALL_PAID_PLANS',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Coupon_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CouponPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `couponId` INTEGER NOT NULL,
    `planId` INTEGER NOT NULL,

    UNIQUE INDEX `CouponPlan_couponId_planId_key`(`couponId`, `planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CouponShop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `couponId` INTEGER NOT NULL,
    `shopDomain` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `CouponShop_couponId_shopDomain_key`(`couponId`, `shopDomain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CouponClaim` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `couponId` INTEGER NULL,
    `couponCode` VARCHAR(40) NOT NULL,
    `couponDurationMonths` INTEGER NOT NULL,
    `shopDomain` VARCHAR(191) NOT NULL,
    `planTier` VARCHAR(191) NOT NULL,
    `priceBeforeDiscount` DECIMAL(10, 2) NOT NULL,
    `discountedPrice` DECIMAL(10, 2) NOT NULL,
    `currencyCode` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `shopifyChargeId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CouponClaim_shopifyChargeId_key`(`shopifyChargeId`),
    INDEX `CouponClaim_shopDomain_idx`(`shopDomain`),
    INDEX `CouponClaim_couponId_idx`(`couponId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SuperAdmin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `password` TEXT NOT NULL,
    `name` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SuperAdmin_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys. MySQL has no `ADD CONSTRAINT IF NOT EXISTS`, so each one is guarded against
-- information_schema and skipped when the database already has it (the `db push` case above).

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'CouponPlan_couponId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `CouponPlan` ADD CONSTRAINT `CouponPlan_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE addFk FROM @stmt;
EXECUTE addFk;
DEALLOCATE PREPARE addFk;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'CouponPlan_planId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `CouponPlan` ADD CONSTRAINT `CouponPlan_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `SubscriptionPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE addFk FROM @stmt;
EXECUTE addFk;
DEALLOCATE PREPARE addFk;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'CouponShop_couponId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `CouponShop` ADD CONSTRAINT `CouponShop_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE addFk FROM @stmt;
EXECUTE addFk;
DEALLOCATE PREPARE addFk;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'CouponClaim_couponId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `CouponClaim` ADD CONSTRAINT `CouponClaim_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE addFk FROM @stmt;
EXECUTE addFk;
DEALLOCATE PREPARE addFk;
