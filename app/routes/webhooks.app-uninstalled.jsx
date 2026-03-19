import { authenticate } from "../shopify.server.js";
import { sessionStorage, updateAppSettings } from "../db.server.js";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  if (session) {
    // Delete all sessions for this shop
    const sessions = await sessionStorage.findSessionsByShop(shop);
    if (sessions.length > 0) {
      await sessionStorage.deleteSessions(sessions.map((s) => s.id));
    }
  }

  // Disable the app in settings — preserves config in case they reinstall
  try {
    await updateAppSettings(shop, {
      app_enabled: false,
      carrier_service_id: null,
    });
  } catch (err) {
    console.error("[webhook] Error updating settings on uninstall:", err);
  }

  return new Response(null, { status: 200 });
};
