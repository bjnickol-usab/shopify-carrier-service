import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, Button, Banner,
  Toast, Frame, Divider, Badge, InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import { getAppSettings, updateAppSettings } from "../db.server.js";

const CARRIER_CREATE = `
  mutation {
    carrierServiceCreate(input: {
      name: "CARRIER_NAME_PLACEHOLDER",
      callbackUrl: "CALLBACK_URL_PLACEHOLDER"
    }) {
      carrierService {
        id
        name
        callbackUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CARRIER_DELETE = `
  mutation carrierServiceDelete($id: ID!) {
    carrierServiceDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const settings = await getAppSettings(session.shop);
    return json({ settings, shopDomain: session.shop, appUrl: process.env.SHOPIFY_APP_URL });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

export async function action({ request }) {
  try {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "register_carrier") {
      const callbackUrl = `${process.env.SHOPIFY_APP_URL}/api/carrier?shop=${shopDomain}`;
      const serviceName = formData.get("service_name") || "Custom Shipping Rates";

      // Build mutation with literal values to avoid input type issues
      const mutation = `
        mutation {
          carrierServiceCreate(input: {
            name: "${serviceName.replace(/"/g, '\\"')}",
            callbackUrl: "${callbackUrl}", supportsServiceDiscovery: true, active: true
          }) {
            carrierService {
              id
              name
              callbackUrl
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const response = await admin.graphql(mutation);
      const data = await response.json();

      console.log("[carrier create] full response:", JSON.stringify(data));

      if (data.errors) {
        return json({ error: data.errors[0]?.message || "GraphQL error" }, { status: 400 });
      }

      if (data.data?.carrierServiceCreate?.userErrors?.length > 0) {
        return json({ error: data.data.carrierServiceCreate.userErrors[0].message }, { status: 400 });
      }

      const service = data.data?.carrierServiceCreate?.carrierService;
      if (!service) {
        return json({ error: "No carrier service returned — check Vercel logs." }, { status: 500 });
      }

      const numericId = service.id.replace("gid://shopify/DeliveryCarrierService/", "");

      await updateAppSettings(shopDomain, {
        carrier_service_id: parseInt(numericId),
        carrier_service_name: service.name,
      });

      return json({ success: true, service });
    }

    if (intent === "unregister_carrier") {
      const settings = await getAppSettings(shopDomain);
      if (!settings.carrier_service_id) {
        return json({ error: "No carrier service registered." }, { status: 400 });
      }

      const gid = `gid://shopify/DeliveryCarrierService/${settings.carrier_service_id}`;
      const response = await admin.graphql(CARRIER_DELETE, { variables: { id: gid } });
      const data = await response.json();

      if (data.data?.carrierServiceDelete?.userErrors?.length > 0) {
        return json({ error: data.data.carrierServiceDelete.userErrors[0].message }, { status: 400 });
      }

      await updateAppSettings(shopDomain, {
        carrier_service_id: null,
        carrier_service_name: null,
      });

      return json({ success: true, unregistered: true });
    }

    if (intent === "toggle_app") {
      const result = await updateAppSettings(shopDomain, {
        app_enabled: formData.get("app_enabled") === "true",
      });
      return json({ success: true, settings: result });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("Settings action error:", err);
    return json({ error: err.message }, { status: 500 });
  }
}

export default function SettingsPage() {
  const { settings, shopDomain, appUrl } = useLoaderData();
  const fetcher = useFetcher();

  const [serviceName, setServiceName] = useState(
    settings.carrier_service_name || "Custom Shipping Rates"
  );
  const [toastMsg, setToastMsg] = useState("");
  const [toastActive, setToastActive] = useState(false);
  const [toastError, setToastError] = useState(false);

  function showToast(msg, error = false) {
    setToastMsg(msg); setToastError(error); setToastActive(true);
  }

  const isLoading = fetcher.state !== "idle";
  const hasCarrier = !!(settings.carrier_service_id || fetcher.data?.service);

  if (fetcher.state === "idle" && fetcher.data && !toastActive) {
    if (fetcher.data.success && fetcher.data.service) showToast("Carrier service registered successfully!");
    else if (fetcher.data.success && fetcher.data.unregistered) showToast("Carrier service removed.");
    else if (fetcher.data.success) showToast("Settings saved.");
    else if (fetcher.data.error) showToast(fetcher.data.error, true);
  }

  function handleRegister() {
    const fd = new FormData();
    fd.append("intent", "register_carrier");
    fd.append("service_name", serviceName);
    fetcher.submit(fd, { method: "post" });
  }

  function handleUnregister() {
    const fd = new FormData();
    fd.append("intent", "unregister_carrier");
    fetcher.submit(fd, { method: "post" });
  }

  function handleToggle(enabled) {
    const fd = new FormData();
    fd.append("intent", "toggle_app");
    fd.append("app_enabled", String(enabled));
    fetcher.submit(fd, { method: "post" });
  }

  return (
    <Frame>
      <Page title="Settings" subtitle="Configure and manage your carrier service">
        <Layout>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">Carrier Service Registration</Text>
                    <Text tone="subdued">
                      Register your app with Shopify so it receives checkout callbacks.
                      Required before your shipping rates appear at checkout.
                    </Text>
                  </BlockStack>
                  <Badge tone={hasCarrier ? "success" : "warning"}>
                    {hasCarrier ? "Registered" : "Not Registered"}
                  </Badge>
                </InlineStack>

                <Divider />

                {hasCarrier ? (
                  <BlockStack gap="300">
                    <Banner tone="success">
                      <BlockStack gap="100">
                        <Text fontWeight="semibold">✓ Carrier service is active</Text>
                        <Text tone="subdued" variant="bodySm">
                          Service name: {settings.carrier_service_name || fetcher.data?.service?.name}
                        </Text>
                        <Text tone="subdued" variant="bodySm">
                          Callback URL: {appUrl}/api/carrier?shop={shopDomain}
                        </Text>
                      </BlockStack>
                    </Banner>
                    <Button tone="critical" variant="plain" onClick={handleUnregister} loading={isLoading}>
                      Unregister Carrier Service
                    </Button>
                  </BlockStack>
                ) : (
                  <BlockStack gap="300">
                    <Banner tone="warning">
                      <Text>
                        Your carrier service is not registered. Customers will not see your
                        shipping rates at checkout until you register below.
                      </Text>
                    </Banner>
                    <BlockStack gap="200">
                      <Text fontWeight="semibold">Service name</Text>
                      <InlineStack gap="300" blockAlign="end">
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            value={serviceName}
                            onChange={(e) => setServiceName(e.target.value)}
                            style={{
                              width: "100%", padding: "8px 12px",
                              border: "1px solid #c9cccf", borderRadius: "8px", fontSize: "14px",
                            }}
                            placeholder="Custom Shipping Rates"
                          />
                        </div>
                        <Button variant="primary" onClick={handleRegister} loading={isLoading} disabled={!serviceName.trim()}>
                          Register Carrier Service
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">App Status</Text>
                    <Text tone="subdued">Disable to stop returning rates without deleting your configuration.</Text>
                  </BlockStack>
                  <Badge tone={settings.app_enabled ? "success" : "critical"}>
                    {settings.app_enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </InlineStack>
                <Divider />
                <Button
                  variant={settings.app_enabled ? "plain" : "primary"}
                  tone={settings.app_enabled ? "critical" : undefined}
                  onClick={() => handleToggle(!settings.app_enabled)}
                  loading={isLoading}
                >
                  {settings.app_enabled ? "Disable App" : "Enable App"}
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Important Notes</Text>
                <Divider />
                <BlockStack gap="300">
                  <BlockStack gap="100">
                    <Text fontWeight="semibold">Shopify Plan Requirement</Text>
                    <Text tone="subdued">
                      Carrier-calculated shipping requires Shopify Advanced plan or higher,
                      or the carrier-calculated shipping add-on on lower plans.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text fontWeight="semibold">Response Time</Text>
                    <Text tone="subdued">
                      Shopify requires your callback to respond within 10 seconds.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text fontWeight="semibold">Rate Caching</Text>
                    <Text tone="subdued">
                      Shopify caches carrier rates for up to 15 minutes per cart.
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text fontWeight="semibold">Callback URL</Text>
                    <Text variant="bodySm" fontWeight="semibold">
                      {appUrl}/api/carrier?shop={shopDomain}
                    </Text>
                  </BlockStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

        </Layout>

        {toastActive && (
          <Toast content={toastMsg} error={toastError} onDismiss={() => setToastActive(false)} />
        )}
      </Page>
    </Frame>
  );
}
