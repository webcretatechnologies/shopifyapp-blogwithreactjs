-- Paid subscriptions receive a fresh article-creation allowance each calendar month.
-- Free continues to use its lifetime Post-count cap.
ALTER TABLE `Shop` ADD COLUMN `articlePeriodUsed` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `Shop` ADD COLUMN `articlePeriodStartedAt` DATETIME(3) NULL;
ALTER TABLE `Shop` ADD COLUMN `articlePeriodEndsAt` DATETIME(3) NULL;
ALTER TABLE `Shop` ADD COLUMN `articlePeriodPlanKey` VARCHAR(191) NULL;
