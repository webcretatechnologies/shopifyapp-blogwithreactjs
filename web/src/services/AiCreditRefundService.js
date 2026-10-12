function isFreePlan(planKey) {
  const plan = String(planKey || "free").toLowerCase();
  return !plan.includes("starter") && !plan.includes("pro") && !plan.includes("business");
}

/**
 * Atomically return the credit reserved by one generation job. The job row is the idempotency
 * record; locking it prevents retries or multiple workers from refunding the same job twice.
 */
export async function refundAiGenerationCredit({ prisma, shopId, jobId, creditSource }) {
  return prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw`
      SELECT id, shopId, creditSource, creditRefunded, createdAt
      FROM AiGenerationJob
      WHERE id = ${jobId}
      FOR UPDATE
    `;
    const job = jobs[0];
    if (!job || Number(job.shopId) !== Number(shopId)) {
      return { refunded: false, changed: false };
    }
    // Report the already-completed refund as successful so a retried worker never writes the
    // job's creditRefunded flag back to false afterward.
    if (job.creditRefunded) return { refunded: true, changed: false };

    const shops = await tx.$queryRaw`
      SELECT id, planKey, aiCreditsUsed, freeAiCreditsUsed, aiCreditsPurchasedUsed,
             aiCreditPeriodStartedAt
      FROM Shop
      WHERE id = ${shopId}
      FOR UPDATE
    `;
    const shop = shops[0];
    if (!shop) throw new Error("Shop no longer exists");

    const source = job.creditSource || creditSource || "plan";
    const aiUsed = Number(shop.aiCreditsUsed || 0);
    const purchasedUsed = Number(shop.aiCreditsPurchasedUsed || 0);
    const freeUsed = Number(shop.freeAiCreditsUsed || 0);

    if (source === "purchased") {
      if (purchasedUsed <= 0 || aiUsed <= 0) {
        throw new Error("Purchased-credit counters have no refundable usage");
      }
      await tx.shop.update({
        where: { id: shopId },
        data: {
          aiCreditsUsed: { decrement: 1 },
          aiCreditsPurchasedUsed: { decrement: 1 },
        },
      });
    } else if (source === "free") {
      if (freeUsed <= 0) throw new Error("Free-credit counter has no refundable usage");
      await tx.shop.update({
        where: { id: shopId },
        data: {
          freeAiCreditsUsed: { decrement: 1 },
          // A later upgrade resets aiCreditsUsed into the paid-period ledger. The lifetime Free
          // counter still needs its refund, but the new paid ledger must remain untouched.
          ...(isFreePlan(shop.planKey) && aiUsed > 0
            ? { aiCreditsUsed: { decrement: 1 } }
            : {}),
        },
      });
    } else {
      const periodStartedAt = shop.aiCreditPeriodStartedAt
        ? new Date(shop.aiCreditPeriodStartedAt)
        : null;
      const jobCreatedAt = new Date(job.createdAt);
      const belongsToCurrentPeriod = !periodStartedAt || jobCreatedAt >= periodStartedAt;

      // A rollover already returned old-period plan credits. Do not subtract that refund from
      // the new period or from the purchased-credit baseline.
      if (belongsToCurrentPeriod && aiUsed > purchasedUsed) {
        await tx.shop.update({
          where: { id: shopId },
          data: { aiCreditsUsed: { decrement: 1 } },
        });
      }
    }

    const claimed = await tx.aiGenerationJob.updateMany({
      where: { id: jobId, shopId, creditRefunded: false },
      data: { creditRefunded: true },
    });
    if (claimed.count !== 1) throw new Error("AI credit refund was already claimed");
    return { refunded: true, changed: true };
  });
}
