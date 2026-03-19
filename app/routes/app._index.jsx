import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, InlineStack,
  Badge, Button, Box, Divider, Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { getAppSettings, getShippingRates, getSurchargeRules } from "../db.server.js";

export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const [settings, rates, rules] = await Promise.all([
      getAppSettings(session.shop),
      getShippingRates(session.shop),
      getSurchargeRules(session.shop),
    ]);
    return json({ settings, rates, rules, shopDomain: session.shop });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

export default function Dashboard() {
  const { settings, rates, rules, shopDomain } = useLoaderData();

  const activeRates = rates.filter((r) => r.is_active);
  const activeRules = rules.filter((r) => r.is_active);
  const hasCarrier = !!settings.carrier_service_id;

  return (
    <Page title="Carrier Service Dashboard" subtitle={shopDomain}>
      <Layout>
        {!hasCarrier && (
          <Layout.Section>
            <Banner tone="warning" title="Carrier service not registered">
              <BlockStack gap="200">
                <Text>
                  Your carrier service hasn't been registered with Shopify yet.
                  Go to Settings to register it — this is required before shipping
                  rates will appear at checkout.
                </Text>
                <Button url="/app/settings" variant="primary">Go to Settings</Button>
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

        {hasCarrier && activeRates.length === 0 && (
          <Layout.Section>
            <Banner tone="warning" title="No active shipping rates">
              <BlockStack gap="200">
                <Text>
                  Your carrier service is registered but has no active shipping rates.
                  Add at least one rate so customers can complete checkout.
                </Text>
                <Button url="/app/rates" variant="primary">Add Shipping Rates</Button>
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" wrap>
            {/* Status Card */}
            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">App Status</Text>
                  <Badge tone={settings.app_enabled ? "success" : "critical"}>
                    {settings.app_enabled ? "Active" : "Disabled"}
                  </Badge>
                </BlockStack>
              </Card>
            </Box>

            {/* Carrier Card */}
            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">Carrier Service</Text>
                  <Badge tone={hasCarrier ? "success" : "warning"}>
                    {hasCarrier ? "Registered" : "Not Registered"}
                  </Badge>
                </BlockStack>
              </Card>
            </Box>

            {/* Rates Card */}
            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">Shipping Rates</Text>
                  <Text variant="headingLg">{activeRates.length}</Text>
                  <Text tone="subdued" variant="bodySm">{rates.length} total</Text>
                </BlockStack>
              </Card>
            </Box>

            {/* Rules Card */}
            <Box minWidth="200px">
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" tone="subdued">Surcharge Rules</Text>
                  <Text variant="headingLg">{activeRules.length}</Text>
                  <Text tone="subdued" variant="bodySm">{rules.length} total</Text>
                </BlockStack>
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">How It Works</Text>
              <Divider />
              <BlockStack gap="300">
                <InlineStack gap="300" blockAlign="start">
                  <Box background="bg-fill-info" borderRadius="full" padding="150" minWidth="28px">
                    <Text alignment="center" fontWeight="bold" tone="info">1</Text>
                  </Box>
                  <BlockStack gap="050">
                    <Text fontWeight="semibold">Register the Carrier Service</Text>
                    <Text tone="subdued">
                      Go to Settings and click Register. Shopify will call your app's
                      callback URL at every checkout to ask for shipping rates.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="300" blockAlign="start">
                  <Box background="bg-fill-info" borderRadius="full" padding="150" minWidth="28px">
                    <Text alignment="center" fontWeight="bold" tone="info">2</Text>
                  </Box>
                  <BlockStack gap="050">
                    <Text fontWeight="semibold">Define Your Base Shipping Rates</Text>
                    <Text tone="subdued">
                      Add shipping options (e.g. Standard $8.00, Expedited $18.00) under
                      Shipping Rates. These are the rates customers see by default.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="300" blockAlign="start">
                  <Box background="bg-fill-info" borderRadius="full" padding="150" minWidth="28px">
                    <Text alignment="center" fontWeight="bold" tone="info">3</Text>
                  </Box>
                  <BlockStack gap="050">
                    <Text fontWeight="semibold">Add Surcharge Rules</Text>
                    <Text tone="subdued">
                      Create rules under Surcharge Rules to add extra shipping cost when
                      specific products or collections are in the cart. The surcharge is
                      added to all your base rates automatically.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="300" blockAlign="start">
                  <Box background="bg-fill-info" borderRadius="full" padding="150" minWidth="28px">
                    <Text alignment="center" fontWeight="bold" tone="info">4</Text>
                  </Box>
                  <BlockStack gap="050">
                    <Text fontWeight="semibold">Shopify Shows Updated Rates</Text>
                    <Text tone="subdued">
                      At checkout, your app calculates the correct rate for each cart
                      and returns it to Shopify in under 10 seconds. Customers see
                      accurate pricing with surcharges already applied.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="300">
            <Button url="/app/rates" variant="primary">Manage Shipping Rates</Button>
            <Button url="/app/surcharges">Manage Surcharge Rules</Button>
            <Button url="/app/settings">Settings</Button>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
