-- Match the live, enforceable plan limits to the revised pricing model.
UPDATE `PlanFeature` SET `limit` = 2 WHERE `plan` = 'free' AND `featureKey` = 'article_limit';
UPDATE `PlanFeature` SET `limit` = 1 WHERE `plan` = 'free' AND `featureKey` = 'template_limit';
UPDATE `PlanFeature` SET `limit` = 2 WHERE `plan` = 'free' AND `featureKey` = 'ai_credits';

UPDATE `PlanFeature` SET `limit` = 30 WHERE `plan` = 'starter' AND `featureKey` = 'article_limit';
UPDATE `PlanFeature` SET `limit` = 10 WHERE `plan` = 'starter' AND `featureKey` = 'template_limit';
UPDATE `PlanFeature` SET `limit` = 15 WHERE `plan` = 'starter' AND `featureKey` = 'ai_credits';

UPDATE `PlanFeature` SET `limit` = 40 WHERE `plan` = 'pro' AND `featureKey` = 'ai_credits';
