/**
 * Resolve a one-time AI-credit purchase from Shopify's authoritative purchase status.
 * Both the webhook fast path and the pending-purchase reconciliation path use this function so
 * approval is atomic and an at-least-once webhook (or a later recovery query) cannot double-grant.
 */
export async function settleAiCreditPurchase(prisma, shopifyPurchaseId, rawStatus) {
  const status = String(rawStatus || "").toUpperCase();
  if (!shopifyPurchaseId || !status) return { changed: false, status: null };

  if (status === "ACTIVE") {
    return prisma.$transaction(async (tx) => {
      const record = await tx.aiCreditPurchase.findUnique({
        where: { shopifyPurchaseId },
      });
      if (!record || record.status !== "PENDING") {
        return { changed: false, status: record?.status || null };
      }

      const claimed = await tx.aiCreditPurchase.updateMany({
        where: { shopifyPurchaseId, status: "PENDING" },
        data: { status: "APPROVED" },
      });
      if (claimed.count !== 1) return { changed: false, status: "APPROVED" };

      await tx.shop.update({
        where: { id: record.shopId },
        data: { aiCreditsPurchased: { increment: record.credits } },
      });
      return { changed: true, status: "APPROVED" };
    });
  }

  if (["DECLINED", "CANCELLED", "EXPIRED"].includes(status)) {
    const updated = await prisma.aiCreditPurchase.updateMany({
      where: { shopifyPurchaseId, status: "PENDING" },
      data: { status },
    });
    return { changed: updated.count === 1, status };
  }

  return { changed: false, status: "PENDING" };
}

/**
 * Recover purchases whose webhook was delayed or missed by asking Shopify for their current
 * status. Shopify purchase IDs are GraphQL Node IDs, so all pending rows can be checked in one
 * query instead of one request per purchase.
 */
export async function reconcilePendingAiCreditPurchases({
  prisma,
  graphqlClient,
  shopId,
  limit = 50,
}) {
  const pending = await prisma.aiCreditPurchase.findMany({
    where: { shopId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { shopifyPurchaseId: true },
  });
  if (pending.length === 0) return [];

  const response = await graphqlClient.request(`
    query AiCreditPurchaseStatuses($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on AppPurchaseOneTime {
          id
          status
        }
      }
    }
  `, { variables: { ids: pending.map((purchase) => purchase.shopifyPurchaseId) } });

  const results = [];
  for (const purchase of response.data?.nodes || []) {
    if (!purchase?.id || !purchase?.status) continue;
    results.push(await settleAiCreditPurchase(prisma, purchase.id, purchase.status));
  }
  return results;
}
