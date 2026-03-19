import crypto from "crypto";
import { calculateShippingRates } from "../db.server.js";

/**
 * Shopify Carrier Service Callback
 *
 * Shopify POSTs to this endpoint at checkout when requesting shipping rates.
 * Must respond within 10 seconds with an array of available rates.
 *
 * Request body shape from Shopify:
 * {
 *   rate: {
 *     origin: { ... },
 *     destination: { ... },
 *     items: [{ product_id, variant_id, quantity, grams, price, sku, ... }],
 *     currency: "USD",
 *     locale: "en"
 *   }
 * }
 *
 * Expected response:
 * {
 *   rates: [
 *     {
 *       service_name: "Standard Shipping",
 *       service_code: "standard",
 *       total_price: "800",   // in cents as a string
 *       currency: "USD",
 *       description: "...",   // optional
 *       min_delivery_date: "2025-01-15",  // optional
 *       max_delivery_date: "2025-01-17",  // optional
 *     }
 *   ]
 * }
 */

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
  // Shopify only POSTs to this endpoint
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Read raw body for HMAC verification
  const rawBody = await request.text();

  // Verify HMAC — reject anything not from Shopify
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  if (!verifyHmac(rawBody, hmacHeader)) {
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

  // Determine shop domain from the request
  // Shopify sends the shop domain in the URL as a query param or in the origin
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop") || request.headers.get("X-Shopify-Shop-Domain") || "";

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
    console.log(`[carrier] ${shopDomain} → ${cartItems.length} items → ${rates.length} rates returned`);

    return new Response(JSON.stringify({ rates }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[carrier] Error calculating rates:", err);
    // Return empty rates on error so checkout doesn't break
    return new Response(JSON.stringify({ rates: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
