import fetch from "node-fetch";

async function check(password) {
  const url = "https://rajiv-market-shop.myshopify.com/password";
  const params = new URLSearchParams();
  params.append("form_type", "storefront_password");
  params.append("utf8", "✓");
  params.append("password", password);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString(),
    redirect: "manual"
  });

  const location = res.headers.get("location");
  const cookie = res.headers.get("set-cookie");
  console.log(`Password "${password}": status=${res.status}, location=${location}, hasCookie=${!!cookie}`);
  return cookie;
}

async function main() {
  const passwords = ["1", "admin", "shopify", "playbook", "password", "rajiv", "wc", "webcreta"];
  for (const pwd of passwords) {
    const cookie = await check(pwd);
    if (cookie) {
      console.log("Found working cookie!");
      break;
    }
  }
}

main().catch(console.error);
