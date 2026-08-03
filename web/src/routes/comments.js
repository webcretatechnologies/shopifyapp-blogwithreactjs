import express from "express";
import shopify from "../../shopify.js";

const router = express.Router();

/**
 * GET /api/comments
 * Fetch comments from Shopify via GraphQL with full author (name, email) details & createdAt timestamps.
 */
router.get("/", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const { status, search, article_id } = req.query;

    let formattedArticleId = article_id;
    if (formattedArticleId && !formattedArticleId.startsWith("gid://")) {
      formattedArticleId = `gid://shopify/Article/${formattedArticleId}`;
    }

    let allComments = [];

    if (formattedArticleId) {
      // Query comments for a single article
      const graphqlQuery = `
        query GetArticleComments($id: ID!) {
          article(id: $id) {
            id
            title
            blog {
              id
              title
            }
            comments(first: 250) {
              edges {
                node {
                  id
                  bodyHtml
                  status
                  createdAt
                  publishedAt
                  author {
                    name
                    email
                  }
                }
              }
            }
          }
        }
      `;
      const response = await client.request(graphqlQuery, { variables: { id: formattedArticleId } });
      const article = response.data?.article;
      if (article && article.comments) {
        allComments = article.comments.edges.map(e => ({
          ...e.node,
          article: {
            id: article.id,
            title: article.title,
            blog: article.blog,
          }
        }));
      }
    } else {
      // Query comments across all articles
      const graphqlQuery = `
        query GetAllComments {
          articles(first: 50) {
            edges {
              node {
                id
                title
                blog {
                  id
                  title
                }
                comments(first: 50) {
                  edges {
                    node {
                      id
                      bodyHtml
                      status
                      createdAt
                      publishedAt
                      author {
                        name
                        email
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const response = await client.request(graphqlQuery);
      const articles = response.data?.articles?.edges || [];

      articles.forEach(articleEdge => {
        const article = articleEdge.node;
        const commentEdges = article.comments?.edges || [];
        commentEdges.forEach(commentEdge => {
          allComments.push({
            ...commentEdge.node,
            article: {
              id: article.id,
              title: article.title,
              blog: article.blog,
            }
          });
        });
      });
    }

    // Apply status filter in memory if requested
    if (status && status !== 'all') {
      allComments = allComments.filter(c => {
        const s = (c.status || "").toLowerCase();
        if (status === 'unapproved' || status === 'pending' || status === 'not_approved') {
          return s === 'unapproved' || s === 'pending' || s === 'not_approved';
        }
        return s === status.toLowerCase();
      });
    }

    // Apply search filter in memory if requested
    if (search && search.trim() !== '') {
      const q = search.toLowerCase();
      allComments = allComments.filter(c => {
        const bodyText = (c.bodyHtml || "").toLowerCase();
        const articleTitle = (c.article?.title || "").toLowerCase();
        const authorName = (c.author?.name || "").toLowerCase();
        const authorEmail = (c.author?.email || "").toLowerCase();
        return (
          bodyText.includes(q) ||
          articleTitle.includes(q) ||
          authorName.includes(q) ||
          authorEmail.includes(q)
        );
      });
    }

    // Sort latest comments first (newest date first)
    allComments.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.publishedAt || 0);
      const dateB = new Date(b.createdAt || b.publishedAt || 0);
      return dateB - dateA;
    });

    res.json({
      comments: allComments,
      total: allComments.length,
      protectedDataRequired: false
    });
  } catch (err) {
    console.error("GET /api/comments error:", err.message);
    const errorMsg = err.response?.errors?.[0]?.message || err.message || "";
    
    if (errorMsg.includes("protected-customer-data") || errorMsg.includes("Comment object")) {
      return res.json({
        comments: [],
        protectedDataRequired: true,
        error: "Protected Customer Data permission required in Shopify Partner Dashboard."
      });
    }

    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/comments/moderate
 * Bulk (or single) comment moderation.
 * Body: { action: 'approve' | 'spam' | 'not_spam' | 'delete', ids: ['gid://...'] }
 */
router.post("/moderate", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const { action, ids } = req.body;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const validActions = ['approve', 'spam', 'not_spam', 'delete'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    let mutationName = '';
    let returnFields = '';
    
    switch (action) {
      case 'approve':
        mutationName = 'commentApprove';
        returnFields = 'comment { id status } userErrors { field message }';
        break;
      case 'spam':
        mutationName = 'commentSpam';
        returnFields = 'comment { id status } userErrors { field message }';
        break;
      case 'not_spam':
        mutationName = 'commentNotSpam';
        returnFields = 'comment { id status } userErrors { field message }';
        break;
      case 'delete':
        mutationName = 'commentDelete';
        returnFields = 'deletedCommentId userErrors { field message }';
        break;
    }

    const mutations = ids.map((id, index) => {
      return `op${index}: ${mutationName}(id: "${id}") { ${returnFields} }`;
    }).join("\n");

    const batchedQuery = `mutation ModerateComments {\n${mutations}\n}`;

    const response = await client.request(batchedQuery);

    const userErrors = [];
    const successIds = [];

    Object.keys(response.data || {}).forEach((key, index) => {
      const result = response.data[key];
      if (result.userErrors && result.userErrors.length > 0) {
        userErrors.push({ id: ids[index], errors: result.userErrors });
      } else {
        successIds.push(ids[index]);
      }
    });

    res.json({
      success: true,
      action,
      successIds,
      userErrors,
    });
  } catch (err) {
    console.error("POST /api/comments/moderate error:", err.message);
    const errorMsg = err.response?.errors?.[0]?.message || err.message || "";
    
    if (errorMsg.includes("protected-customer-data") || errorMsg.includes("Comment object")) {
      return res.status(403).json({
        error: "Protected Customer Data permission required in Shopify Partner Dashboard.",
        protectedDataRequired: true
      });
    }

    res.status(500).json({ error: err.message });
  }
});

export default router;
