import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button,
  DataTable, Badge, Modal, FormLayout, TextField, Select,
  EmptyState, Toast, Frame, Box, Divider, Banner,
} from "@shopify/polaris";
import { PlusIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import {
  getShippingRates, upsertShippingRate, deleteShippingRate,
  toggleShippingRate, getRateTiers, saveRateTiers,
} from "../db.server.js";

export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const rates = await getShippingRates(session.shop);
    const tiersMap = {};
    for (const rate of rates) {
      tiersMap[rate.id] = await getRateTiers(session.shop, rate.id);
    }
    return json({ rates, tiersMap, shopDomain: session.shop });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "upsert") {
      const rate = {
        name: formData.get("name"),
        service_code: formData.get("service_code"),
        base_price: formData.get("base_price"),
        description: formData.get("description"),
        min_delivery_days: formData.get("min_delivery_days"),
        max_delivery_days: formData.get("max_delivery_days"),
        is_active: formData.get("is_active") === "true",
        sort_order: formData.get("sort_order"),
      };
      if (!rate.name || !rate.service_code || isNaN(parseFloat(rate.base_price))) {
        return json({ error: "Name, service code, and price are required." }, { status: 400 });
      }
      const result = await upsertShippingRate(shopDomain, rate);
      const tiersJson = formData.get("tiers");
      if (tiersJson) {
        const tiers = JSON.parse(tiersJson);
        await saveRateTiers(shopDomain, result.id, tiers);
      }
      return json({ success: true, rate: result });
    }

    if (intent === "delete") {
      await deleteShippingRate(shopDomain, formData.get("rate_id"));
      return json({ success: true });
    }

    if (intent === "toggle") {
      const result = await toggleShippingRate(
        shopDomain, formData.get("rate_id"), formData.get("is_active") === "true"
      );
      return json({ success: true, rate: result });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("Rates action error:", err);
    return json({ error: err.message }, { status: 500 });
  }
}

const emptyForm = {
  name: "", service_code: "", base_price: "", description: "",
  min_delivery_days: "", max_delivery_days: "", is_active: true, sort_order: "0",
};

export default function RatesPage() {
  const { rates, tiersMap } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [tiers, setTiers] = useState([]);
  const [toastMsg, setToastMsg] = useState("");
  const [toastActive, setToastActive] = useState(false);
  const [toastError, setToastError] = useState(false);

  function showToast(msg, error = false) {
    setToastMsg(msg); setToastError(error); setToastActive(true);
  }
  function setField(key) { return (val) => setForm((f) => ({ ...f, [key]: val })); }

  if (actionData?.error && !toastActive) showToast(actionData.error, true);

  function openAdd() {
    setEditingRate(null);
    setForm(emptyForm);
    setTiers([]);
    setModalOpen(true);
  }

  function openEdit(rate) {
    setEditingRate(rate);
    setForm({
      name: rate.name,
      service_code: rate.service_code,
      base_price: (rate.base_price_cents / 100).toFixed(2),
      description: rate.description || "",
      min_delivery_days: rate.min_delivery_days ? String(rate.min_delivery_days) : "",
      max_delivery_days: rate.max_delivery_days ? String(rate.max_delivery_days) : "",
      is_active: rate.is_active,
      sort_order: String(rate.sort_order),
    });
    const existingTiers = (tiersMap[rate.id] || []).map((t) => ({
      min_order: (t.min_order_cents / 100).toFixed(2),
      max_order: t.max_order_cents !== null ? (t.max_order_cents / 100).toFixed(2) : "",
      price: (t.price_cents / 100).toFixed(2),
    }));
    setTiers(existingTiers);
    setModalOpen(true);
  }

  function addTier() {
    setTiers((t) => [...t, { min_order: "", max_order: "", price: "" }]);
  }

  function removeTier(index) {
    setTiers((t) => t.filter((_, i) => i !== index));
  }

  function updateTier(index, field, value) {
    setTiers((t) => t.map((tier, i) => i === index ? { ...tier, [field]: value } : tier));
  }

  function handleSave() {
    for (const tier of tiers) {
      if (tier.min_order === "" || isNaN(parseFloat(tier.min_order))) {
        showToast("Each tier needs a valid minimum order amount.", true);
        return;
      }
      if (isNaN(parseFloat(tier.price))) {
        showToast("Each tier needs a valid shipping price.", true);
        return;
      }
    }
    const fd = new FormData();
    fd.append("intent", "upsert");
    Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
    fd.append("tiers", JSON.stringify(tiers));
    submit(fd, { method: "post" });
    setModalOpen(false);
    showToast(editingRate ? "Rate updated" : "Rate created");
  }

  function handleDelete(id) { setDeletingId(id); setDeleteModalOpen(true); }

  function confirmDelete() {
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("rate_id", deletingId);
    submit(fd, { method: "post" });
    setDeleteModalOpen(false);
    showToast("Rate deleted");
  }

  function handleToggle(rate) {
    const fd = new FormData();
    fd.append("intent", "toggle");
    fd.append("rate_id", rate.id);
    fd.append("is_active", String(!rate.is_active));
    submit(fd, { method: "post" });
  }

  const rows = rates.map((rate) => {
    const tierCount = (tiersMap[rate.id] || []).length;
    return [
      <BlockStack gap="050">
        <Text fontWeight="semibold">{rate.name}</Text>
        <Text tone="subdued" variant="bodySm">{rate.service_code}</Text>
      </BlockStack>,
      <BlockStack gap="050">
        <Text fontWeight="semibold">${(rate.base_price_cents / 100).toFixed(2)}</Text>
        {tierCount > 0 && (
          <Text tone="subdued" variant="bodySm">{tierCount} tier{tierCount !== 1 ? "s" : ""}</Text>
        )}
      </BlockStack>,
      rate.description || "—",
      rate.min_delivery_days && rate.max_delivery_days
        ? `${rate.min_delivery_days}–${rate.max_delivery_days} days` : "—",
      <Button variant="plain" onClick={() => handleToggle(rate)}>
        <Badge tone={rate.is_active ? "success" : "critical"}>
          {rate.is_active ? "Active" : "Inactive"}
        </Badge>
      </Button>,
      <InlineStack gap="200">
        <Button variant="plain" icon={EditIcon} onClick={() => openEdit(rate)} accessibilityLabel="Edit" />
        <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => handleDelete(rate.id)} accessibilityLabel="Delete" />
      </InlineStack>,
    ];
  });

  return (
    <Frame>
      <Page
        title="Shipping Rates"
        subtitle="Base rates returned at checkout — optionally tiered by order subtotal"
        primaryAction={<Button variant="primary" icon={PlusIcon} onClick={openAdd}>Add Rate</Button>}
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              {rates.length === 0 ? (
                <Box padding="800">
                  <EmptyState
                    heading="No shipping rates yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    action={{ content: "Add Rate", onAction: openAdd }}
                  >
                    <Text>
                      Add shipping options here. Each rate can have tiered pricing
                      based on order subtotal — e.g. free shipping over $100.
                    </Text>
                  </EmptyState>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={["Rate Name / Code", "Price", "Description", "Delivery", "Status", "Actions"]}
                  rows={rows}
                />
              )}
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingRate ? "Edit Shipping Rate" : "Add Shipping Rate"}
          primaryAction={{ content: editingRate ? "Save Changes" : "Add Rate", onAction: handleSave }}
          secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
          large
        >
          <Modal.Section>
            <FormLayout>
              <TextField label="Rate name" value={form.name} onChange={setField("name")}
                placeholder="USAB Standard" autoComplete="off"
                helpText="What customers see at checkout" />
              <TextField label="Service code" value={form.service_code} onChange={setField("service_code")}
                placeholder="usab-standard" autoComplete="off"
                helpText="Unique identifier — lowercase, no spaces"
                disabled={!!editingRate} />
              <TextField label="Default price" type="number" value={form.base_price}
                onChange={setField("base_price")} prefix="$" placeholder="8.00" autoComplete="off"
                helpText="Used when no tier matches the order subtotal" />
              <TextField label="Description (optional)" value={form.description}
                onChange={setField("description")} placeholder="3–5 business days" autoComplete="off" />
              <FormLayout.Group>
                <TextField label="Min delivery days" type="number" value={form.min_delivery_days}
                  onChange={setField("min_delivery_days")} placeholder="3" autoComplete="off" />
                <TextField label="Max delivery days" type="number" value={form.max_delivery_days}
                  onChange={setField("max_delivery_days")} placeholder="5" autoComplete="off" />
              </FormLayout.Group>
              <FormLayout.Group>
                <Select label="Status"
                  options={[{ label: "Active", value: "true" }, { label: "Inactive", value: "false" }]}
                  value={String(form.is_active)}
                  onChange={(v) => setForm((f) => ({ ...f, is_active: v === "true" }))} />
                <TextField label="Sort order" type="number" value={form.sort_order}
                  onChange={setField("sort_order")} autoComplete="off"
                  helpText="Lower = shown first" />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>

          <Modal.Section>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h3">Price Tiers (optional)</Text>
                  <Text tone="subdued">
                    Override the default price based on order subtotal.
                    The first tier where the subtotal falls in range wins.
                    Leave max blank for "and above".
                  </Text>
                </BlockStack>
                <Button variant="plain" icon={PlusIcon} onClick={addTier}>Add Tier</Button>
              </InlineStack>

              {tiers.length === 0 && (
                <Banner tone="info">
                  <Text>No tiers — default price always used. Click "Add Tier" to create tiered pricing.</Text>
                </Banner>
              )}

              {tiers.length > 0 && (
                <BlockStack gap="300">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 40px", gap: "12px", alignItems: "end" }}>
                    <Text fontWeight="semibold" tone="subdued">Min order subtotal</Text>
                    <Text fontWeight="semibold" tone="subdued">Max order subtotal</Text>
                    <Text fontWeight="semibold" tone="subdued">Shipping price</Text>
                    <div />
                    {tiers.map((tier, index) => (
                      <>
                        <TextField key={`min-${index}`} label="" labelHidden type="number"
                          value={tier.min_order} onChange={(v) => updateTier(index, "min_order", v)}
                          prefix="$" placeholder="0.00" autoComplete="off" />
                        <TextField key={`max-${index}`} label="" labelHidden type="number"
                          value={tier.max_order} onChange={(v) => updateTier(index, "max_order", v)}
                          prefix="$" placeholder="no limit" autoComplete="off" />
                        <TextField key={`price-${index}`} label="" labelHidden type="number"
                          value={tier.price} onChange={(v) => updateTier(index, "price", v)}
                          prefix="$" placeholder="0.00" autoComplete="off"
                          helpText={tier.price === "0" || tier.price === "0.00" ? "Free shipping" : ""} />
                        <div key={`del-${index}`} style={{ display: "flex", alignItems: "center" }}>
                          <Button variant="plain" tone="critical" icon={DeleteIcon}
                            onClick={() => removeTier(index)} accessibilityLabel="Remove tier" />
                        </div>
                      </>
                    ))}
                  </div>
                  <Divider />
                  <Text tone="subdued" variant="bodySm">
                    Example: $0–$50 → $5.00 shipping | $50–$100 → $10.00 | $100+ → $0.00 (free)
                  </Text>
                </BlockStack>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>

        <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}
          title="Delete shipping rate?"
          primaryAction={{ content: "Delete", destructive: true, onAction: confirmDelete }}
          secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}>
          <Modal.Section>
            <Text>This rate and all its tiers will be permanently deleted.</Text>
          </Modal.Section>
        </Modal>

        {toastActive && (
          <Toast content={toastMsg} error={toastError} onDismiss={() => setToastActive(false)} />
        )}
      </Page>
    </Frame>
  );
}
