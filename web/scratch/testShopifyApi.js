import shopify, { prisma } from "../shopify.js";

async function main() {
  const session = await prisma.session.findFirst({
    where: { shop: "rajiv-market-shop.myshopify.com" }
  });
  
  if (!session) {
    console.error("No session found in DB");
    return;
  }

  console.log("Found Session ID:", session.id);
  console.log("Scope in Session:", session.scope);
  console.log("Token sample:", session.accessToken.substring(0, 15) + "...");

  const restClient = new shopify.api.clients.Rest({ session });
  const gqlClient = new shopify.api.clients.Graphql({ session });

  console.log("Testing REST client...");
  try {
    const res = await restClient.get({ path: "shop" });
    console.log("REST succeeded! Shop name:", res.body.shop.name);
  } catch (err) {
    console.error("REST failed:", err.message);
  }

  console.log("Testing GraphQL client...");
  try {
    const res = await gqlClient.request(`
      query {
        __type(name: "WebhookSubscriptionTopic") {
          enumValues {
            name
          }
        }
      }
    `);
    const mutationRes = await gqlClient.request(`
      mutation {
        webhookSubscriptionCreate(
          topic: ARTICLES_CREATE,
          webhookSubscription: {
            callbackUrl: "https://rajiv-market-shop.myshopify.com/api/webhooks",
            format: JSON
          }
        ) {
          userErrors {
            field
            message
          }
          webhookSubscription {
            id
            topic
          }
        }
      }
    `);
    console.log("Mutation Response:", JSON.stringify(mutationRes, null, 2));
  } catch (err) {
    console.error("GraphQL failed:", err.message);
    if (err.response) {
      console.error("Response body:", JSON.stringify(err.response, null, 2));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
