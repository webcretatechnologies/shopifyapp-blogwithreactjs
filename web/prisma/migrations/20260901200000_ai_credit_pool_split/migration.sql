-- Tracks how much of Shop.aiCreditsPurchased has actually been spent, separately from
-- aiCreditsUsed (which counts every generation regardless of which pool paid for it) - lets
-- purchased credits stay usable on their own after a plan downgrade shrinks the plan's own
-- ai_credits allowance below the shop's lifetime usage.
ALTER TABLE `Shop` ADD COLUMN `aiCreditsPurchasedUsed` INTEGER NOT NULL DEFAULT 0;

-- Which pool ("plan" | "purchased") a given job's 1 credit was actually spent from, so a refund
-- reverses the correct counter.
ALTER TABLE `AiGenerationJob` ADD COLUMN `creditSource` VARCHAR(191) NOT NULL DEFAULT 'plan';
