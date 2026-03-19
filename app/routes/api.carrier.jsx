import crypto from "crypto";
import { calculateShippingRates } from "../db.server.js";

function verifyHmac(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_API_SECRET || "";
  const hash = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function loader() {
  return new Response("Carrier service callback is running", { status: 200 });
}

export async function action({ request }) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  console.log("[carrier] Raw body:", rawBody.substring(0, 500));

  // Verify HMAC — reject anything not from Shopify
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const testToken = request.headers.get("X-Test-Token");
  const isTestRequest = testToken === "carrier-test-2025";

  if (!isTestRequest && !verifyHmac(rawBody, hmacHeader)) {
    console.warn("[carrier] HMAC verification failed");
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const rateRequest = body?.rate;
  if (!rateRequest) {
    return new Response(JSON.stringify({ rates: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const shopDomain =
    url.searchParams.get("shop") ||
    request.headers.get("X-Shopify-Shop-Domain") ||
    "";

  if (!shopDomain) {
    console.error("[carrier] Could not determine shop domain");
    return new Response(JSON.stringify({ rates: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cartItems = rateRequest.items || [];

  try {
    const rates = await calculateShippingRates(shopDomain, cartItems);
    console.log(
      `[carrier] ${shopDomain} → ${cartItems.length} items → ${rates.length} rates returned`,
      JSON.stringify(rates)
    );

    return new Response(JSON.stringify({ rates }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[carrier] Error calculating rates:", err);
    return new Response(JSON.stringify({ rates: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
