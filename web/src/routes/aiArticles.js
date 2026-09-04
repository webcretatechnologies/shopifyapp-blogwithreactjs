import express from "express";
import { prisma } from "../../shopify.js";
import { getAiCreditLimit, getAiCreditStatus } from "../services/PlanFeatureService.js";
import { generateArticleBlocks, AI_STAGES } from "../services/AiArticleService.js";
import { isShopFirstPost } from "../utils/firstPost.js";

const router = express.Router();

async function getShopFromSession(res) {
  const session = res.locals.shopify?.session;
  if (!session?.shop) return null;
  return prisma.shop.findUnique({ where: { domain: session.shop } });
}

/**
 * A credit is meant to pay for a real generation. If the job degraded to the deterministic
 * filler (Groq unavailable/rate-limited/erroring) or failed outright, the merchant didn't get
 * that - so the credit spent up front (POST /generate, before generation even runs, so a
 * half-finished run never leaves a charged credit with no draft to show for it) gets handed back
 * here instead. `updateMany` with the `gt: 0` guards makes this a safe no-op rather than going
 * negative if it's ever somehow called twice for the same job.
 *
 * `creditSource` (from the job's own AiGenerationJob.creditSource, set at spend time) decides
 * which counter actually decrements — a credit spent from the purchased pool must refund back
 * into aiCreditsPurchasedUsed, never aiCreditsUsed alone, or the purchased pool's own remaining
 * balance would silently overstate what's actually left.
 *
 * Returns whether a refund actually happened, so the caller can stamp AiGenerationJob.
 * creditRefunded - previously this only ever logged to the server console, with nothing
 * merchant-facing anywhere telling them their credit was given back at all.
 */
async function refundAiCredit(shopId, jobId, reason, creditSource) {
  try {
    const fromPurchased = creditSource === "purchased";
    const { count } = await prisma.shop.updateMany({
      where: {
        id: shopId,
        aiCreditsUsed: { gt: 0 },
        ...(fromPurchased ? { aiCreditsPurchasedUsed: { gt: 0 } } : {}),
      },
      data: {
        aiCreditsUsed: { decrement: 1 },
        ...(fromPurchased ? { aiCreditsPurchasedUsed: { decrement: 1 } } : {}),
      },
    });
    if (count > 0) console.error(`[AI] job ${jobId} refunded a ${creditSource} credit to shop ${shopId} (${reason})`);
    return count > 0;
  } catch (err) {
    console.error(`[AI] job ${jobId} failed to refund credit to shop ${shopId}:`, err.message);
    return false;
  }
}

const planLabel = (planKey) => {
  const p = String(planKey || "free").toLowerCase();
  if (p.includes("starter")) return "Starter";
  if (p.includes("business")) return "Business";
  if (p.includes("pro")) return "Pro";
  return "Free";
};

const slugify = (str) =>
  String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";

/**
 * Runs one generation to completion, updating the job row as it goes so the list page's poller
 * has something to render. Deliberately fire-and-forget rather than awaited by the request: the
 * merchant is redirected to the list immediately (same as Bloggle), and a generation that
 * outlives the HTTP request must still finish.
 *
 * A crash mid-run leaves the job "failed" with its message rather than stuck at "running",
 * because the whole body is wrapped - an abandoned spinner is worse than a visible error.
 */
export async function runJob(jobId) {
  try {
    const job = await prisma.aiGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    const setStage = async (stage, progress) =>
      prisma.aiGenerationJob.update({ where: { id: jobId }, data: { stage, progress } });

    await prisma.aiGenerationJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date(), stage: AI_STAGES[0].label, progress: AI_STAGES[0].progress },
    });

    const params = job.params || {};

    // The stage labels are the merchant-facing narration of one synchronous call. They're paced
    // so the progress bar moves at a believable rate rather than snapping 0 -> 100; when this is
    // swapped for a streaming model the same labels can be driven off real progress events.
    for (const stage of AI_STAGES.slice(1, 3)) {
      await new Promise((r) => setTimeout(r, 400));
      await setStage(stage.label, stage.progress);
    }

    const { blocks, title, excerpt, metaTitle, metaDescription, usedFallback, fallbackReason } = await generateArticleBlocks({
      brief: params.brief,
      title: params.title,
      templateKey: params.templateKey,
      templateBlocks: params.templateBlocks,
      products: params.products,
      colors: params.colors,
    });

    for (const stage of AI_STAGES.slice(3)) {
      await new Promise((r) => setTimeout(r, 300));
      await setStage(stage.label, stage.progress);
    }

    // A daily Groq quota (distinct from the per-minute one AiArticleService already retries once
    // on its own) doesn't clear for minutes-to-hours - telling the merchant that plainly is more
    // useful than the generic "unavailable" wording, which reads like something to retry right away.
    const isDailyLimit = /daily generation limit/i.test(String(fallbackReason || ""));
    // Lives on the post (see aiWarning below) so it's still visible whenever the merchant opens
    // this draft, not just in the one-time list-page toast (newlyFinished/newlyFailed in
    // posts/index.jsx) - a merchant who wasn't watching the list at that exact moment would
    // otherwise never see any mention that a credit was actually given back.
    const fallbackWarning = usedFallback
      ? isDailyLimit
        ? "AI's daily generation limit was reached, so this draft was written with generic placeholder text instead - your AI credit was refunded. Try generating again in a little while, or rewrite this one now."
        : "AI service was unavailable, so this draft uses generic placeholder text instead of generated content - your AI credit was refunded. Review and rewrite before publishing."
      : null;

    // contentHtml is left for the editor to compile on first open: compileBlocksToHtml is a
    // browser module (it needs Tiptap's DOM), so the server stores the AST and the editor
    // renders from it - exactly what applying a template already does.
    await prisma.post.update({
      where: { id: job.postId },
      data: {
        title: params.title || title,
        excerpt: excerpt || null,
        // Only set when the model actually returned one - never overwrites a merchant's own SEO
        // fields with null on a fallback run, and leaves the editor's own defaults alone otherwise.
        ...(metaTitle ? { metaTitle } : {}),
        ...(metaDescription ? { metaDescription } : {}),
        contentJson: blocks,
        editorMode: "builder",
        // Lives on the post (not just the job) so the "needs review" signal survives past the
        // list page's short job-retention window - it's only cleared once the merchant actually
        // saves the post, which is the real signal that they've reviewed it.
        aiWarning: fallbackWarning,
        // The editor auto-saves once on first open when this is true, so the client's own
        // normalization becomes the stored version before the merchant ever sees an
        // unsaved-changes bar on a post they haven't touched yet.
        needsAutoSave: true,
      },
    });

    // Refund (if this run degraded) BEFORE the job row is marked "done", so creditRefunded lands
    // in the same write the list page's poller sees - previously the refund only ever showed up
    // as a server console log, with nothing merchant-facing anywhere confirming it happened.
    let creditRefunded = false;
    if (usedFallback) {
      console.error(`[AI] job ${jobId} degraded to fallback content:`, fallbackReason);
      creditRefunded = await refundAiCredit(job.shopId, jobId, fallbackReason, job.creditSource);
    }

    await prisma.aiGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "done",
        stage: "Ready",
        progress: 100,
        finishedAt: new Date(),
        warning: fallbackWarning,
        creditRefunded,
      },
    });
  } catch (err) {
    console.error("[AI] job", jobId, "failed:", err);
    await prisma.aiGenerationJob
      .update({
        where: { id: jobId },
        data: {
          status: "failed",
          stage: "Generation failed",
          error: String(err?.message || err).slice(0, 2000),
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
    // `job` (fetched at the top of the try block) is out of scope here - a genuinely failed run
    // still needs its credit back, so re-read just enough to refund it.
    const failedJob = await prisma.aiGenerationJob.findUnique({ where: { id: jobId }, select: { shopId: true, creditSource: true } }).catch(() => null);
    if (failedJob) {
      const creditRefunded = await refundAiCredit(failedJob.shopId, jobId, err?.message, failedJob.creditSource);
      if (creditRefunded) {
        await prisma.aiGenerationJob.update({ where: { id: jobId }, data: { creditRefunded } }).catch(() => {});
      }
    }
  }
}

// ─── GET /api/ai/credits — allowance for the wizard's button label ────────────
router.get("/credits", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const status = getAiCreditStatus(shop.planKey, shop.aiCreditsUsed || 0, shop.aiCreditsPurchased || 0, shop.aiCreditsPurchasedUsed || 0);
    res.json({
      used: shop.aiCreditsUsed || 0,
      // The wizard's "X of Y left" / "used all Y" copy reads this as the real ceiling — the
      // plan's own allowance plus whatever's been purchased, not the bare plan limit, so a shop
      // with unused purchased credits never shows a false "you're out" state.
      limit: status.effectiveLimit,
      remaining: status.remaining,
      plan: planLabel(shop.planKey),
    });
  } catch (err) {
    console.error("GET /api/ai/credits", err);
    res.status(500).json({ error: "Failed to load AI credits" });
  }
});

// ─── POST /api/ai/generate — spend a credit, create the draft, start the job ──
router.post("/generate", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { brief, templateKey, templateBlocks, title, categoryId, blogId, author, slug, products, colors } =
      req.body || {};

    // The brief is HTML from the rich text editor now, so an "empty" one still comes back as
    // "<p></p>" - strip tags before judging it empty, the same check the wizard's own button
    // uses (briefHasContent in CreateArticleWizard.jsx) to decide whether it's even clickable.
    if (!String(brief || "").replace(/<[^>]*>/g, "").trim() && !String(title || "").trim()) {
      return res.status(400).json({ error: "Add a topic or some content for the AI to work from." });
    }
    // No templateKey/templateBlocks means "Blank template" was picked - AiArticleService builds
    // its own starting layout for that case (buildBlankScaffold), so this is no longer a reason
    // to reject the request.

// Two independent pools, not one flat ceiling — see getAiCreditStatus's docblock for why: a
    // plan downgrade that shrinks the plan's own allowance below lifetime usage must never strand
    // unspent purchased credits behind it.
    const creditStatus = getAiCreditStatus(shop.planKey, shop.aiCreditsUsed || 0, shop.aiCreditsPurchased || 0, shop.aiCreditsPurchasedUsed || 0);
    if (!creditStatus.canGenerate) {
      const planLimit = getAiCreditLimit(shop.planKey);
      const purchased = shop.aiCreditsPurchased || 0;
      const allowanceDescription = purchased > 0
        ? `${planLimit} on your ${planLabel(shop.planKey)} plan plus ${purchased} purchased`
        : `${planLimit} on your ${planLabel(shop.planKey)} plan`;
      return res.status(403).json({
        error: `You've used all ${allowanceDescription} AI credit${creditStatus.effectiveLimit === 1 ? "" : "s"}. Buy more credits or upgrade your plan for more.`,
        code: "ai_credit_limit_reached",
        used: shop.aiCreditsUsed || 0,
        limit: creditStatus.effectiveLimit,
      });
    }
    // Which pool this generation actually draws from — the plan's own allowance first, the
    // purchased pool only once that's exhausted (see nextCreditSource's docblock).
    const creditSource = creditStatus.nextCreditSource;

    const postTitle = String(title || "").trim() || "Untitled article";

    // The credit is spent and the draft created in one transaction: a generation that half-runs
    // must not leave a charged credit with no article to show for it, or vice versa.
    const { post, job } = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          shopId: shop.id,
          title: postTitle,
          slug: slugify(slug || postTitle),
          status: "draft",
          author: author || null,
          categoryId: categoryId ? parseInt(categoryId, 10) : null,
          blogId: blogId || null,
          editorMode: "builder",
        },
      });
      const createdJob = await tx.aiGenerationJob.create({
        data: {
          shopId: shop.id,
          postId: created.id,
          status: "queued",
          stage: AI_STAGES[0].label,
          progress: 2,
          creditSource,
          params: {
            brief,
            templateKey: templateKey || null,
            templateBlocks: templateBlocks || null,
            title: postTitle,
            // Only the fields the generator binds are kept - the picker hands back far more
            // than that, and a job row shouldn't carry a snapshot of the whole catalogue.
            products: Array.isArray(products)
              ? products.slice(0, 12).map((p) => ({
                  id: p.id || null,
                  title: p.title || "",
                  handle: p.handle || null,
                  price: p.price ?? null,
                  image: p.image || null,
                  variantId: p.variantId || null,
                }))
              : null,
            colors: colors && (colors.primaryColor || colors.backgroundColor) ? colors : null,
          },
        },
      });
      await tx.shop.update({
        where: { id: shop.id },
        data: {
          aiCreditsUsed: { increment: 1 },
          ...(creditSource === "purchased" ? { aiCreditsPurchasedUsed: { increment: 1 } } : {}),
        },
      });
      return { post: created, job: createdJob };
    });

    // Not awaited: the merchant goes straight to the list and watches the progress row.
    runJob(job.id).catch((err) => console.error("[AI] unhandled runJob rejection:", err));

    const isFirstPost = await isShopFirstPost(prisma, shop.id);

    res.json({
      job: { id: job.id, postId: post.id, status: job.status, stage: job.stage, progress: job.progress },
      postId: post.id,
      creditsRemaining: creditStatus.remaining == null ? null : Math.max(0, creditStatus.remaining - 1),
      isFirstPost,
    });
  } catch (err) {
    console.error("POST /api/ai/generate", err);
    res.status(500).json({ error: "Failed to start generation" });
  }
});

// ─── GET /api/ai/jobs — active/recent jobs for the list page's progress rows ──
router.get("/jobs", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const jobs = await prisma.aiGenerationJob.findMany({
      where: {
        shopId: shop.id,
        // Finished jobs stay listed briefly so a row that completes between two polls still
        // gets a chance to flip to "Ready" rather than just vanishing mid-progress.
        OR: [
          { status: { in: ["queued", "running"] } },
          { finishedAt: { gte: new Date(Date.now() - 2 * 60 * 1000) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        postId: true,
        status: true,
        stage: true,
        progress: true,
        error: true,
        warning: true,
        creditRefunded: true,
      },
    });
    res.json({ jobs });
  } catch (err) {
    console.error("GET /api/ai/jobs", err);
    res.status(500).json({ error: "Failed to load generation status" });
  }
});

export default router;
