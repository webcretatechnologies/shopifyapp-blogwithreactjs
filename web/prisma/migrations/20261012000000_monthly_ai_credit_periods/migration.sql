-- AI plan allowances refresh monthly, including subscriptions charged annually.
ALTER TABLE `Shop` ADD COLUMN `aiCreditPeriodStartedAt` DATETIME(3) NULL;
ALTER TABLE `Shop` ADD COLUMN `aiCreditPeriodPlanKey` VARCHAR(191) NULL;

-- Keep the enforced Free-plan limits in sync with the public pricing card.
UPDATE `PlanFeature` SET `limit` = 5 WHERE `plan` = 'free' AND `featureKey` = 'article_limit';
UPDATE `PlanFeature` SET `limit` = 2 WHERE `plan` = 'free' AND `featureKey` = 'template_limit';
UPDATE `PlanFeature` SET `limit` = 3 WHERE `plan` = 'free' AND `featureKey` = 'ai_credits';
