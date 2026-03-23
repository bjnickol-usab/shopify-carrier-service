-- ============================================================
-- Shopify Carrier Service App - Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Sessions table
-- ============================================================
CREATE TABLE IF NOT EXISTS shopify_sessions (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  state TEXT,
  is_online BOOLEAN DEFAULT FALSE,
  scope TEXT,
  expires TIMESTAMPTZ,
  access_token TEXT,
  user_id BIGINT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  account_owner BOOLEAN,
  locale TEXT,
  collaborator BOOLEAN,
  email_verified BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopify_sessions_shop ON shopify_sessions(shop);

-- ============================================================
-- Base Shipping Rates table
-- These are the rates your carrier service returns to Shopify.
-- Define all the shipping options your store offers here.
-- ============================================================
CREATE TABLE IF NOT EXISTS shipping_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_domain TEXT NOT NULL,
  name TEXT NOT NULL,
  service_code TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  min_delivery_days INTEGER,
  max_delivery_days INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_domain, service_code)
);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_shop ON shipping_rates(shop_domain);

-- ============================================================
-- Surcharge Rules table
-- When a matching product or collection is in the cart,
-- add a surcharge to all (or specific) shipping rates.
-- ============================================================
CREATE TABLE IF NOT EXISTS surcharge_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_domain TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('product', 'collection')),
  shopify_id TEXT NOT NULL,
  shopify_title TEXT NOT NULL DEFAULT '',
  shopify_image_url TEXT,
  surcharge_type TEXT NOT NULL DEFAULT 'fixed' CHECK (surcharge_type IN ('fixed', 'percentage')),
  surcharge_amount DECIMAL(10, 2) NOT NULL CHECK (surcharge_amount >= 0),
  surcharge_label TEXT NOT NULL DEFAULT 'Surcharge',
  applies_per TEXT NOT NULL DEFAULT 'order' CHECK (applies_per IN ('order', 'item')),
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_domain, rule_type, shopify_id)
);

CREATE INDEX IF NOT EXISTS idx_surcharge_rules_shop ON surcharge_rules(shop_domain);
CREATE INDEX IF NOT EXISTS idx_surcharge_rules_active ON surcharge_rules(shop_domain, is_active);

-- ============================================================
-- App Settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_domain TEXT UNIQUE NOT NULL,
  app_enabled BOOLEAN DEFAULT TRUE,
  carrier_service_id BIGINT,
  carrier_service_name TEXT DEFAULT 'Custom Shipping Rates',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_shipping_rates_updated_at ON shipping_rates;
CREATE TRIGGER update_shipping_rates_updated_at
  BEFORE UPDATE ON shipping_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_surcharge_rules_updated_at ON surcharge_rules;
CREATE TRIGGER update_surcharge_rules_updated_at
  BEFORE UPDATE ON surcharge_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE shopify_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE surcharge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_sessions" ON shopify_sessions;
DROP POLICY IF EXISTS "service_role_shipping_rates" ON shipping_rates;
DROP POLICY IF EXISTS "service_role_surcharge_rules" ON surcharge_rules;
DROP POLICY IF EXISTS "service_role_app_settings" ON app_settings;

CREATE POLICY "service_role_sessions" ON shopify_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_shipping_rates" ON shipping_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_surcharge_rules" ON surcharge_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_app_settings" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Rate Tiers table
-- Tiered pricing per shipping rate based on order subtotal.
-- Tiers are evaluated in order: the first matching tier wins.
-- min_order_cents is inclusive, max_order_cents is exclusive
-- (null max_order_cents means "and above").
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipping_rate_id UUID NOT NULL REFERENCES shipping_rates(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  min_order_cents INTEGER NOT NULL DEFAULT 0,
  max_order_cents INTEGER,
  price_cents INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_tiers_rate ON rate_tiers(shipping_rate_id);
CREATE INDEX IF NOT EXISTS idx_rate_tiers_shop ON rate_tiers(shop_domain);

DROP TRIGGER IF EXISTS update_rate_tiers_updated_at ON rate_tiers;
CREATE TRIGGER update_rate_tiers_updated_at
  BEFORE UPDATE ON rate_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE rate_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_rate_tiers" ON rate_tiers;
CREATE POLICY "service_role_rate_tiers" ON rate_tiers FOR ALL USING (true) WITH CHECK (true);
