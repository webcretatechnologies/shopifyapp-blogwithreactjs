-- Lifetime AI credit counter (never reset; ai_credits is a one-off allowance, not a monthly quota)
ALTER TABLE `Shop` ADD COLUMN `aiCreditsUsed` INTEGER NOT NULL DEFAULT 0;

-- One AI article generation, tracked separately from Post so an abandoned or failed run
-- never leaves stage text stranded on a real article.
CREATE TABLE `AiGenerationJob` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shopId` INTEGER NOT NULL,
  `postId` INTEGER NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `stage` VARCHAR(191) NOT NULL DEFAULT 'Queued',
  `progress` INTEGER NOT NULL DEFAULT 0,
  `params` JSON NULL,
  `notifyEmail` VARCHAR(191) NULL,
  `error` TEXT NULL,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `AiGenerationJob_shopId_idx`(`shopId`),
  INDEX `AiGenerationJob_shopId_status_idx`(`shopId`, `status`),
  INDEX `AiGenerationJob_postId_idx`(`postId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AiGenerationJob` ADD CONSTRAINT `AiGenerationJob_shopId_fkey`
  FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
