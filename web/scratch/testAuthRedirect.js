import fetch from "node-fetch";

async function main() {
  const shop = "rajiv-market-shop.myshopify.com";
  // The backend runs on a dynamically assigned port, but it also listens on PORT 3000 if BACKEND_PORT/PORT is set.
  // Wait, let's list the ports by scanning the local processes or checking the log!
  // In the log, we saw it running on port 34429 or 41221.
  // Let's try 34429 first.
  const ports = [34429, 41221, 3000];
  for (const port of ports) {
    try {
      console.log(`Testing port ${port}...`);
      const res = await fetch(`http://localhost:${port}/api/auth?shop=${shop}`, {
        redirect: "manual"
      });
      console.log(`Port ${port} status:`, res.status);
      console.log(`Headers:`, JSON.stringify(res.headers.raw(), null, 2));
    } catch (err) {
      console.error(`Port ${port} failed:`, err.message);
    }
  }
}

main().catch(console.error);
