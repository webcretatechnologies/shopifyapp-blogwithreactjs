-- Catch-up migration: reconciles prisma/migrations with prisma/schema.prisma.
--
-- Several models and columns were only ever applied to developer databases with `prisma db push`
-- and never captured as a migration, so `prisma migrate deploy` on a fresh server produced a
-- schema the app could not run against. Now that the deploy path runs `migrate deploy` (see
-- package.json's `setup` script), the migration history has to be the complete story.
--
-- Every statement is guarded so this is a no-op on databases that already have these objects
-- from `db push`: MySQL supports `IF NOT EXISTS` only for CREATE TABLE/INDEX, so columns and
-- foreign keys are checked against information_schema and skipped when already present.

-- Post: missing columns

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Post' AND COLUMN_NAME = 'excludeFromSitemap');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `Post` ADD COLUMN `excludeFromSitemap` BOOLEAN NOT NULL DEFAULT false', 'SELECT 1');
PREPARE s1 FROM @stmt;
EXECUTE s1;
DEALLOCATE PREPARE s1;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Post' AND COLUMN_NAME = 'featuredImageAlt');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `Post` ADD COLUMN `featuredImageAlt` TEXT NULL', 'SELECT 1');
PREPARE s2 FROM @stmt;
EXECUTE s2;
DEALLOCATE PREPARE s2;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Post' AND COLUMN_NAME = 'trackingKey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `Post` ADD COLUMN `trackingKey` VARCHAR(191) NULL', 'SELECT 1');
PREPARE s3 FROM @stmt;
EXECUTE s3;
DEALLOCATE PREPARE s3;

-- PostAnalytic: missing columns

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PostAnalytic' AND COLUMN_NAME = 'addToCart');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostAnalytic` ADD COLUMN `addToCart` INTEGER NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s4 FROM @stmt;
EXECUTE s4;
DEALLOCATE PREPARE s4;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PostAnalytic' AND COLUMN_NAME = 'checkouts');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostAnalytic` ADD COLUMN `checkouts` INTEGER NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s5 FROM @stmt;
EXECUTE s5;
DEALLOCATE PREPARE s5;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PostAnalytic' AND COLUMN_NAME = 'conversions');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostAnalytic` ADD COLUMN `conversions` INTEGER NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s6 FROM @stmt;
EXECUTE s6;
DEALLOCATE PREPARE s6;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PostAnalytic' AND COLUMN_NAME = 'lastCurrency');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostAnalytic` ADD COLUMN `lastCurrency` VARCHAR(191) NULL', 'SELECT 1');
PREPARE s7 FROM @stmt;
EXECUTE s7;
DEALLOCATE PREPARE s7;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PostAnalytic' AND COLUMN_NAME = 'revenue');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostAnalytic` ADD COLUMN `revenue` DOUBLE NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s8 FROM @stmt;
EXECUTE s8;
DEALLOCATE PREPARE s8;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PostAnalytic' AND COLUMN_NAME = 'revenueUsd');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostAnalytic` ADD COLUMN `revenueUsd` DOUBLE NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s9 FROM @stmt;
EXECUTE s9;
DEALLOCATE PREPARE s9;

-- ShopifyArticle: missing columns

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'conflictPayload');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `conflictPayload` JSON NULL', 'SELECT 1');
PREPARE s10 FROM @stmt;
EXECUTE s10;
DEALLOCATE PREPARE s10;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'lastError');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `lastError` TEXT NULL', 'SELECT 1');
PREPARE s11 FROM @stmt;
EXECUTE s11;
DEALLOCATE PREPARE s11;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'lastInboundHash');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `lastInboundHash` VARCHAR(191) NULL', 'SELECT 1');
PREPARE s12 FROM @stmt;
EXECUTE s12;
DEALLOCATE PREPARE s12;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'lastOutboundHash');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `lastOutboundHash` VARCHAR(191) NULL', 'SELECT 1');
PREPARE s13 FROM @stmt;
EXECUTE s13;
DEALLOCATE PREPARE s13;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'lastRemoteUpdatedAt');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `lastRemoteUpdatedAt` DATETIME(3) NULL', 'SELECT 1');
PREPARE s14 FROM @stmt;
EXECUTE s14;
DEALLOCATE PREPARE s14;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'lastSourceHash');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `lastSourceHash` VARCHAR(191) NULL', 'SELECT 1');
PREPARE s15 FROM @stmt;
EXECUTE s15;
DEALLOCATE PREPARE s15;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'lastSyncDirection');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `lastSyncDirection` VARCHAR(191) NULL', 'SELECT 1');
PREPARE s16 FROM @stmt;
EXECUTE s16;
DEALLOCATE PREPARE s16;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'lastSyncedSnapshot');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `lastSyncedSnapshot` JSON NULL', 'SELECT 1');
PREPARE s17 FROM @stmt;
EXECUTE s17;
DEALLOCATE PREPARE s17;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'sourceMetafieldId');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `sourceMetafieldId` VARCHAR(191) NULL', 'SELECT 1');
PREPARE s18 FROM @stmt;
EXECUTE s18;
DEALLOCATE PREPARE s18;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'structureDegraded');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `structureDegraded` BOOLEAN NOT NULL DEFAULT false', 'SELECT 1');
PREPARE s19 FROM @stmt;
EXECUTE s19;
DEALLOCATE PREPARE s19;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'syncMode');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `syncMode` VARCHAR(191) NOT NULL DEFAULT ''external_html''', 'SELECT 1');
PREPARE s20 FROM @stmt;
EXECUTE s20;
DEALLOCATE PREPARE s20;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'syncRevision');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `syncRevision` INTEGER NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s21 FROM @stmt;
EXECUTE s21;
DEALLOCATE PREPARE s21;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND COLUMN_NAME = 'syncState');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ShopifyArticle` ADD COLUMN `syncState` VARCHAR(191) NOT NULL DEFAULT ''linked''', 'SELECT 1');
PREPARE s22 FROM @stmt;
EXECUTE s22;
DEALLOCATE PREPARE s22;

CREATE TABLE IF NOT EXISTS `PostRelatedPost` (
    `postId` INTEGER NOT NULL,
    `relatedPostId` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `PostRelatedPost_postId_idx`(`postId`),
    INDEX `PostRelatedPost_relatedPostId_idx`(`relatedPostId`),
    PRIMARY KEY (`postId`, `relatedPostId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ArticleSyncLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `postId` INTEGER NULL,
    `shopifyArticleId` VARCHAR(191) NULL,
    `direction` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `message` TEXT NULL,
    `localHash` VARCHAR(191) NULL,
    `remoteHash` VARCHAR(191) NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ArticleSyncLog_shopId_idx`(`shopId`),
    INDEX `ArticleSyncLog_postId_idx`(`postId`),
    INDEX `ArticleSyncLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Template` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `thumbnail` VARCHAR(191) NULL,
    `blocks` JSON NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'template',
    `shopId` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `accent` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `preview` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Template_key_key`(`key`),
    INDEX `Template_shopId_idx`(`shopId`),
    INDEX `Template_source_idx`(`source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AnalyticsVisitor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `visitorHash` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnalyticsVisitor_postId_date_idx`(`postId`, `date`),
    UNIQUE INDEX `AnalyticsVisitor_postId_date_visitorHash_key`(`postId`, `date`, `visitorHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ProcessedOrderWebhook` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ProcessedOrderWebhook_shopId_orderId_key`(`shopId`, `orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Post' AND INDEX_NAME = 'Post_trackingKey_key');
SET @stmt := IF(@exists = 0, 'CREATE UNIQUE INDEX `Post_trackingKey_key` ON `Post`(`trackingKey`)', 'SELECT 1');
PREPARE s23 FROM @stmt;
EXECUTE s23;
DEALLOCATE PREPARE s23;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PostAnalytic' AND INDEX_NAME = 'PostAnalytic_date_idx');
SET @stmt := IF(@exists = 0, 'CREATE INDEX `PostAnalytic_date_idx` ON `PostAnalytic`(`date`)', 'SELECT 1');
PREPARE s24 FROM @stmt;
EXECUTE s24;
DEALLOCATE PREPARE s24;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND INDEX_NAME = 'ShopifyArticle_shopifyArticleId_key');
SET @stmt := IF(@exists = 0, 'CREATE UNIQUE INDEX `ShopifyArticle_shopifyArticleId_key` ON `ShopifyArticle`(`shopifyArticleId`)', 'SELECT 1');
PREPARE s25 FROM @stmt;
EXECUTE s25;
DEALLOCATE PREPARE s25;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ShopifyArticle' AND INDEX_NAME = 'ShopifyArticle_shopifyArticleId_idx');
SET @stmt := IF(@exists = 0, 'CREATE INDEX `ShopifyArticle_shopifyArticleId_idx` ON `ShopifyArticle`(`shopifyArticleId`)', 'SELECT 1');
PREPARE s26 FROM @stmt;
EXECUTE s26;
DEALLOCATE PREPARE s26;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'PostRelatedPost_postId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostRelatedPost` ADD CONSTRAINT `PostRelatedPost_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE s27 FROM @stmt;
EXECUTE s27;
DEALLOCATE PREPARE s27;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'PostRelatedPost_relatedPostId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `PostRelatedPost` ADD CONSTRAINT `PostRelatedPost_relatedPostId_fkey` FOREIGN KEY (`relatedPostId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE s28 FROM @stmt;
EXECUTE s28;
DEALLOCATE PREPARE s28;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'Template_shopId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `Template` ADD CONSTRAINT `Template_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE s29 FROM @stmt;
EXECUTE s29;
DEALLOCATE PREPARE s29;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'AnalyticsVisitor_postId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `AnalyticsVisitor` ADD CONSTRAINT `AnalyticsVisitor_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE s30 FROM @stmt;
EXECUTE s30;
DEALLOCATE PREPARE s30;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ProcessedOrderWebhook_shopId_fkey');
SET @stmt := IF(@exists = 0, 'ALTER TABLE `ProcessedOrderWebhook` ADD CONSTRAINT `ProcessedOrderWebhook_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE s31 FROM @stmt;
EXECUTE s31;
DEALLOCATE PREPARE s31;

-- Legacy table from 0_init, replaced by `Template` plus the static src/data/blogTemplates.js
-- catalogue. No code reads it any more; dropping it is what removes it from the schema drift.
DROP TABLE IF EXISTS `BlogTemplate`;
