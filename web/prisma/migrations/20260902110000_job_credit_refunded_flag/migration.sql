-- Lets GET /api/ai/jobs (and the list page it feeds) tell the merchant their credit was actually
-- given back on a degraded/failed generation, not just that something went wrong.
ALTER TABLE `AiGenerationJob` ADD COLUMN `creditRefunded` BOOLEAN NOT NULL DEFAULT false;
