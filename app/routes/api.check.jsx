import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { getAppSettings } from "../db.server.js";

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

    const services = data.data?.deliveryCarrierServices?.edges?.map(
      (e) => e.node
    ) || [];

    return json({
      shopDomain: session.shop,
      appSettings: {
        carrier_service_id: settings.carrier_service_id,
        carrier_service_name: settings.carrier_service_name,
      },
      shopifyCarrierServices: services,
      expectedCallbackUrl: `${process.env.SHOPIFY_APP_URL}/api/carrier?shop=${session.shop}`,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return json({ error: err.message }, { status: 500 });
  }
}
