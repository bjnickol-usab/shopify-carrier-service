import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server.js";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw await login(request);
  }
  return json({ showForm: true, apiKey: process.env.SHOPIFY_API_KEY || "" });
}

export async function action({ request }) {
  return login(request);
}

export default function Auth() {
  const { apiKey } = useLoaderData();
  const actionData = useActionData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ maxWidth: 400, width: "100%", padding: "2rem" }}>
          <h1 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Carrier Service App</h1>
          <Form method="post">
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="shop" style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
                Shop domain
              </label>
              <input
                type="text"
                id="shop"
                name="shop"
                placeholder="your-store.myshopify.com"
                style={{
                  width: "100%", padding: "10px 12px",
                  border: "1px solid #c9cccf", borderRadius: "8px",
                  fontSize: "14px", boxSizing: "border-box",
                }}
              />
            </div>
            {actionData?.errors?.shop && (
              <p style={{ color: "red", marginBottom: "1rem" }}>{actionData.errors.shop}</p>
            )}
            <button
              type="submit"
              style={{
                width: "100%", padding: "10px", backgroundColor: "#008060",
                color: "white", border: "none", borderRadius: "8px",
                fontSize: "14px", fontWeight: 600, cursor: "pointer",
              }}
            >
              Install App
            </button>
          </Form>
        </div>
      </div>
    </AppProvider>
  );
}
