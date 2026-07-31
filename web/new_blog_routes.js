// ─── GET /api/posts/shopify/blogs — Fetch Shopify blogs list ─────────────────
router.get("/shopify/blogs", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const result = await client.request(`
      query ListBlogs($first: Int!) {
        blogs(first: $first) {
          nodes { id title handle commentPolicy templateSuffix updatedAt }
        }
      }
    `, { variables: { first: 50 } });
    const blogs = result.data?.blogs?.nodes || [];

    res.json({
      blogs: blogs.map((b) => ({
        id: ArticleSyncService.numericIdFromGid(b.id),
        title: b.title,
        handle: b.handle,
        commentPolicy: b.commentPolicy,
        templateSuffix: b.templateSuffix,
        updatedAt: b.updatedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/blogs/:id — Fetch a single Shopify blog ────────
router.get("/shopify/blogs/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const gid = ArticleSyncService.gidFromNumericId(req.params.id, "Blog");

    const result = await client.request(`
      query GetBlog($id: ID!) {
        blog(id: $id) {
          id title handle commentPolicy templateSuffix
          seoTitle: metafield(namespace: "global", key: "title_tag") { value }
          seoDescription: metafield(namespace: "global", key: "description_tag") { value }
        }
      }
    `, { variables: { id: gid } });

    const b = result.data?.blog;
    if (!b) return res.status(404).json({ error: "Not found" });

    res.json({
      blog: {
        id: ArticleSyncService.numericIdFromGid(b.id),
        title: b.title,
        handle: b.handle,
        commentPolicy: b.commentPolicy || "DISABLED",
        templateSuffix: b.templateSuffix || "",
        seoTitle: b.seoTitle?.value || "",
        seoDescription: b.seoDescription?.value || "",
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/shopify/blogs — Create a new Shopify blog ─────────────
router.post("/shopify/blogs", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const { title, handle, commentPolicy, templateSuffix, seoTitle, seoDescription } = req.body;

    const metafields = [];
    if (seoTitle) metafields.push({ namespace: "global", key: "title_tag", type: "single_line_text_field", value: seoTitle });
    if (seoDescription) metafields.push({ namespace: "global", key: "description_tag", type: "single_line_text_field", value: seoDescription });

    const input = {
      title,
      handle: handle || undefined,
      commentPolicy: commentPolicy || undefined,
      templateSuffix: templateSuffix || undefined,
    };
    if (metafields.length > 0) input.metafields = metafields;

    const client = new shopify.api.clients.Graphql({ session });
    const result = await client.request(`
      mutation blogCreate($blog: BlogCreateInput!) {
        blogCreate(blog: $blog) {
          blog { id }
          userErrors { field message }
        }
      }
    `, { variables: { blog: input } });

    if (result.data?.blogCreate?.userErrors?.length) {
      return res.status(400).json({ error: result.data.blogCreate.userErrors[0].message });
    }

    res.json({ blog: { id: ArticleSyncService.numericIdFromGid(result.data.blogCreate.blog.id) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/posts/shopify/blogs/:id — Update a Shopify blog ──────────────
router.put("/shopify/blogs/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const { title, handle, commentPolicy, templateSuffix, seoTitle, seoDescription } = req.body;
    
    const gid = ArticleSyncService.gidFromNumericId(req.params.id, "Blog");
    const client = new shopify.api.clients.Graphql({ session });
    
    const input = {
      title,
      handle: handle || undefined,
      commentPolicy: commentPolicy || undefined,
      templateSuffix: templateSuffix || undefined,
    };
    
    const result = await client.request(`
      mutation blogUpdate($id: ID!, $blog: BlogUpdateInput!) {
        blogUpdate(id: $id, blog: $blog) {
          blog { id }
          userErrors { field message }
        }
      }
    `, { variables: { id: gid, blog: input } });

    if (result.data?.blogUpdate?.userErrors?.length) {
      return res.status(400).json({ error: result.data.blogUpdate.userErrors[0].message });
    }
    
    // Now upsert the SEO metafields safely using metafieldsSet
    const metafields = [];
    if (seoTitle !== undefined) metafields.push({ ownerId: gid, namespace: "global", key: "title_tag", type: "single_line_text_field", value: seoTitle });
    if (seoDescription !== undefined) metafields.push({ ownerId: gid, namespace: "global", key: "description_tag", type: "single_line_text_field", value: seoDescription });
    
    if (metafields.length > 0) {
      await client.request(`
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }
      `, { variables: { metafields } });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/posts/shopify/blogs/:id — Delete a Shopify blog ───────────
router.delete("/shopify/blogs/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    
    const rawId = req.params.id;
    const numericId = rawId.includes("/") ? rawId.split("/").pop() : rawId;
    const gid = "gid://shopify/Blog/" + numericId;

    const client = new shopify.api.clients.Graphql({ session });
    
    const result = await client.request(`
      mutation blogDelete($id: ID!) {
        blogDelete(id: $id) {
          userErrors { field message }
        }
      }
    `, { variables: { id: gid } });

    if (result.data?.blogDelete?.userErrors?.length) {
      return res.status(400).json({ error: result.data.blogDelete.userErrors[0].message });
    }
    
    // Clean up local posts that belong to this blog ID
    try {
      const shopifyArticles = await prisma.shopifyArticle.findMany({
        where: { shopifyBlogId: String(numericId) },
        select: { postId: true }
      });
      const postIds = shopifyArticles.map(sa => sa.postId);
      
      if (postIds.length > 0) {
        await prisma.postTag.deleteMany({ where: { postId: { in: postIds } } });
        await prisma.postProduct.deleteMany({ where: { postId: { in: postIds } } });
        await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      }
    } catch (dbErr) {
      console.warn("DB cleanup error after blog deletion:", dbErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Delete blog error:", err);
    res.status(500).json({ error: err.message });
  }
});
