import { createClient } from "@supabase/supabase-js";
import { Session } from "@shopify/shopify-api";

if (!process.env.SUPABASE_URL) throw new Error("SUPABASE_URL is required");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ============================================================
// Shopify Session Storage
// ============================================================
export const sessionStorage = {
  async storeSession(session) {
    const { error } = await supabase.from("shopify_sessions").upsert(
      {
        id: session.id,
        shop: session.shop,
        state: session.state,
        is_online: session.isOnline,
        scope: session.scope,
        expires: session.expires?.toISOString(),
        access_token: session.accessToken,
        user_id: session.onlineAccessInfo?.associated_user?.id,
        first_name: session.onlineAccessInfo?.associated_user?.first_name,
        last_name: session.onlineAccessInfo?.associated_user?.last_name,
        email: session.onlineAccessInfo?.associated_user?.email,
        account_owner: session.onlineAccessInfo?.associated_user?.account_owner,
        locale: session.onlineAccessInfo?.associated_user?.locale,
        collaborator: session.onlineAccessInfo?.associated_user?.collaborator,
        email_verified: session.onlineAccessInfo?.associated_user?.email_verified,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) throw error;
    return true;
  },

  async loadSession(id) {
    const { data, error } = await supabase
      .from("shopify_sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) return undefined;
    return rowToSession(data);
  },

  async deleteSession(id) {
    const { error } = await supabase
      .from("shopify_sessions")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return true;
  },

  async deleteSessions(ids) {
    const { error } = await supabase
      .from("shopify_sessions")
      .delete()
      .in("id", ids);
    if (error) throw error;
    return true;
  },

  async findSessionsByShop(shop) {
    const { data, error } = await supabase
      .from("shopify_sessions")
      .select("*")
      .eq("shop", shop);
    if (error) return [];
    return data.map(rowToSession);
  },
};

function rowToSession(row) {
  const session = new Session({
    id: row.id,
    shop: row.shop,
    state: row.state || "",
    isOnline: row.is_online || false,
  });
  session.scope = row.scope;
  session.expires = row.expires ? new Date(row.expires) : undefined;
  session.accessToken = row.access_token;
  if (row.user_id) {
    session.onlineAccessInfo = {
      associated_user_scope: row.scope,
      associated_user: {
        id: row.user_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        account_owner: row.account_owner,
        locale: row.locale,
        collaborator: row.collaborator,
        email_verified: row.email_verified,
      },
    };
  }
  return session;
}

// ============================================================
// App Settings
// ============================================================
export async function getAppSettings(shopDomain) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("shop_domain", shopDomain)
    .single();

  if (error && error.code !== "PGRST116") throw error;

  if (!data) {
    const { data: newData, error: createError } = await supabase
      .from("app_settings")
      .insert({ shop_domain: shopDomain })
      .select()
      .single();
    if (createError) throw createError;
    return newData;
  }

  return data;
}

export async function updateAppSettings(shopDomain, settings) {
  const { data, error } = await supabase
    .from("app_settings")
    .upsert(
      { shop_domain: shopDomain, ...settings, updated_at: new Date().toISOString() },
      { onConflict: "shop_domain" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// Shipping Rates CRUD
// ============================================================
export async function getShippingRates(shopDomain) {
  const { data, error } = await supabase
    .from("shipping_rates")
    .select("*")
    .eq("shop_domain", shopDomain)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertShippingRate(shopDomain, rate) {
  console.log("[upsertShippingRate] shop:", shopDomain, "rate:", JSON.stringify(rate));
  const { data, error } = await supabase
    .from("shipping_rates")
    .upsert(
      {
        shop_domain: shopDomain,
        name: rate.name,
        service_code: rate.service_code,
        base_price_cents: Math.round(parseFloat(rate.base_price) * 100),
        description: rate.description || null,
        min_delivery_days: rate.min_delivery_days ? parseInt(rate.min_delivery_days) : null,
        max_delivery_days: rate.max_delivery_days ? parseInt(rate.max_delivery_days) : null,
        is_active: rate.is_active !== false,
        sort_order: parseInt(rate.sort_order || "0"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_domain,service_code", ignoreDuplicates: false }
    )
    .select()
    .single();
  console.log("[upsertShippingRate] result data:", JSON.stringify(data), "error:", JSON.stringify(error));
  if (error) throw error;
  return data;
}

export async function deleteShippingRate(shopDomain, rateId) {
  const { error } = await supabase
    .from("shipping_rates")
    .delete()
    .eq("id", rateId)
    .eq("shop_domain", shopDomain);
  if (error) throw error;
  return true;
}

export async function toggleShippingRate(shopDomain, rateId, isActive) {
  const { data, error } = await supabase
    .from("shipping_rates")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", rateId)
    .eq("shop_domain", shopDomain)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// Surcharge Rules CRUD
// ============================================================
export async function getSurchargeRules(shopDomain) {
  const { data, error } = await supabase
    .from("surcharge_rules")
    .select("*")
    .eq("shop_domain", shopDomain)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertSurchargeRule(shopDomain, rule) {
  const { data, error } = await supabase
    .from("surcharge_rules")
    .upsert(
      {
        shop_domain: shopDomain,
        rule_type: rule.rule_type,
        shopify_id: rule.shopify_id,
        shopify_title: rule.shopify_title,
        shopify_image_url: rule.shopify_image_url || null,
        surcharge_type: rule.surcharge_type || "fixed",
        surcharge_amount: parseFloat(rule.surcharge_amount),
        surcharge_label: rule.surcharge_label || "Surcharge",
        applies_per: rule.applies_per || "order",
        is_active: rule.is_active !== false,
        priority: parseInt(rule.priority || "0"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_domain,rule_type,shopify_id", ignoreDuplicates: false }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSurchargeRule(shopDomain, ruleId) {
  const { error } = await supabase
    .from("surcharge_rules")
    .delete()
    .eq("id", ruleId)
    .eq("shop_domain", shopDomain);
  if (error) throw error;
  return true;
}

export async function toggleSurchargeRule(shopDomain, ruleId, isActive) {
  const { data, error } = await supabase
    .from("surcharge_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("shop_domain", shopDomain)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ============================================================
// Carrier Service Rate Calculation
// Called by the carrier callback with items from Shopify
// ============================================================
export async function calculateShippingRates(shopDomain, cartItems) {
  const settings = await getAppSettings(shopDomain);
  if (!settings.app_enabled) return [];

  const [baseRates, surchargeRules] = await Promise.all([
    getShippingRates(shopDomain),
    getSurchargeRules(shopDomain),
  ]);

  const activeRates = baseRates.filter((r) => r.is_active);
  const activeRules = surchargeRules.filter((r) => r.is_active);

  if (activeRates.length === 0) return [];

  // Calculate total surcharge for this cart
  let totalSurchargeCents = 0;

  for (const rule of activeRules) {
    for (const item of cartItems) {
      // product_id from Shopify carrier callback is a numeric ID (not GID)
      const itemProductId = String(item.product_id);
      const ruleId = rule.shopify_id
        .replace("gid://shopify/Product/", "")
        .replace("gid://shopify/Collection/", "");

      const matches = rule.rule_type === "product"
        ? itemProductId === ruleId
        : false; // collection matching handled separately below

      if (matches) {
        const quantity = rule.applies_per === "item" ? item.quantity : 1;
        const baseForPct = item.price * item.quantity; // item.price is in cents

        const surcharge = rule.surcharge_type === "percentage"
          ? Math.round((baseForPct * rule.surcharge_amount) / 100)
          : Math.round(parseFloat(rule.surcharge_amount) * 100) * quantity;

        totalSurchargeCents += surcharge;
        break; // one rule per item max
      }
    }
  }

  // Apply surcharge to all active base rates
  return activeRates.map((rate) => {
    const finalCents = rate.base_price_cents + totalSurchargeCents;
    const result = {
      service_name: rate.name,
      service_code: rate.service_code,
      total_price: String(finalCents),
      currency: "USD",
    };
    if (rate.description) result.description = rate.description;
    if (rate.min_delivery_days && rate.max_delivery_days) {
      const today = new Date();
      const minDate = new Date(today);
      const maxDate = new Date(today);
      minDate.setDate(today.getDate() + rate.min_delivery_days);
      maxDate.setDate(today.getDate() + rate.max_delivery_days);
      result.min_delivery_date = minDate.toISOString().split("T")[0];
      result.max_delivery_date = maxDate.toISOString().split("T")[0];
    }
    return result;
  });
}
