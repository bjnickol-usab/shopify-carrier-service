import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server.js";
import { getAppSettings } from "../db.server.js";
import { Page, Card, BlockStack, Text } from "@shopify/polaris";

const CARRIER_SERVICES_QUERY = `
  query {
    deliveryCarrierServices(first: 10) {
      edges {
        node {
          id
          name
          callbackUrl
          active
        }
      }
    }
  }
`;

export async function loader({ request }) {
  try {
    const { session, admin } = await authenticate.admin(request);
    const settings = await getAppSettings(session.shop);
    const response = await admin.graphql(CARRIER_SERVICES_QUERY);
    const data = await response.json();
    const services = data.data?.deliveryCarrierServices?.edges?.map((e) => e.node) || [];
    return json({
      shopDomain: session.shop,
      dbCarrierId: settings.carrier_service_id,
      dbCarrierName: settings.carrier_service_name,
      shopifyServices: services,
      expectedUrl: `${process.env.SHOPIFY_APP_URL}/api/carrier?shop=${session.shop}`,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return json({ error: err.message });
  }
}

export default function CheckPage() {
  const data = useLoaderData();

  if (data.error) {
    return (
      <Page title="Carrier Check">
        <Card><Text tone="critical">Error: {data.error}</Text></Card>
      </Page>
    );
  }

  return (
    <Page title="Carrier Service Diagnostic">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd">App Database</Text>
            <Text>Carrier ID in DB: {data.dbCarrierId || "NULL"}</Text>
            <Text>Carrier Name in DB: {data.dbCarrierName || "NULL"}</Text>
            <Text>Expected callback URL: {data.expectedUrl}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd">Shopify Carrier Services ({data.shopifyServices.length} found)</Text>
            {data.shopifyServices.length === 0 && (
              <Text tone="critical">⚠ No carrier services registered in Shopify at all</Text>
            )}
            {data.shopifyServices.map((s) => (
              <BlockStack key={s.id} gap="100">
                <Text fontWeight="semibold">{s.name}</Text>
                <Text>ID: {s.id}</Text>
                <Text>Callback URL: {s.callbackUrl}</Text>
                <Text>Active: {String(s.active)}</Text>
                <Text tone={s.callbackUrl === data.expectedUrl ? "success" : "critical"}>
                  URL match: {s.callbackUrl === data.expectedUrl ? "✓ YES" : "✗ NO — MISMATCH"}
                </Text>
              </BlockStack>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
