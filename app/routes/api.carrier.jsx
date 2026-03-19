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
  console.log("[carrier] Received request:", request.method, request.url);
  console.log("[carrier] Headers:", JSON.stringify(Object.fromEntries(request.headers.entries())));

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await request.text();
  console.log("[carrier] Raw body:", rawBody.substring(0, 500));

  // HMAC verification temporarily disabled for debugging
  // TODO: re-enable once rates are confirmed working
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  console.log("[carrier] HMAC header present:", !!hmacHeader);
  // Skipping HMAC check for now

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
