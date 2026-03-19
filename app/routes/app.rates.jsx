import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button,
  DataTable, Badge, Modal, FormLayout, TextField, Select,
  EmptyState, Toast, Frame, Box,
} from "@shopify/polaris";
import { PlusIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import {
  getShippingRates, upsertShippingRate, deleteShippingRate, toggleShippingRate,
} from "../db.server.js";

export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const rates = await getShippingRates(session.shop);
    return json({ rates, shopDomain: session.shop });
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
      return json({ success: true, rate: result });
    }

    if (intent === "delete") {
      await deleteShippingRate(shopDomain, formData.get("rate_id"));
      return json({ success: true });
    }

    if (intent === "toggle") {
      const result = await toggleShippingRate(
        shopDomain,
        formData.get("rate_id"),
        formData.get("is_active") === "true"
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
  const { rates } = useLoaderData();
  const submit = useSubmit();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [toastMsg, setToastMsg] = useState("");
  const [toastActive, setToastActive] = useState(false);

  function showToast(msg) { setToastMsg(msg); setToastActive(true); }
  function setField(key) { return (val) => setForm((f) => ({ ...f, [key]: val })); }

  function openAdd() {
    setEditingRate(null);
    setForm(emptyForm);
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
    setModalOpen(true);
  }

  function handleSave() {
    const fd = new FormData();
    fd.append("intent", "upsert");
    Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
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

  const rows = rates.map((rate) => [
    <BlockStack gap="050">
      <Text fontWeight="semibold">{rate.name}</Text>
      <Text tone="subdued" variant="bodySm">{rate.service_code}</Text>
    </BlockStack>,
    <Text fontWeight="semibold">${(rate.base_price_cents / 100).toFixed(2)}</Text>,
    rate.description || "—",
    rate.min_delivery_days && rate.max_delivery_days
      ? `${rate.min_delivery_days}–${rate.max_delivery_days} days`
      : "—",
    <Button variant="plain" onClick={() => handleToggle(rate)}>
      <Badge tone={rate.is_active ? "success" : "critical"}>
        {rate.is_active ? "Active" : "Inactive"}
      </Badge>
    </Button>,
    <InlineStack gap="200">
      <Button variant="plain" icon={EditIcon} onClick={() => openEdit(rate)} accessibilityLabel="Edit" />
      <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => handleDelete(rate.id)} accessibilityLabel="Delete" />
    </InlineStack>,
  ]);

  return (
    <Frame>
      <Page
        title="Shipping Rates"
        subtitle="Base rates your carrier service returns to Shopify at checkout"
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
                      Add your shipping options here (e.g. Standard Shipping $8.00,
                      Expedited $18.00). These are the base rates customers see —
                      surcharge rules will add to these automatically.
                    </Text>
                  </EmptyState>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={["Rate Name / Code", "Base Price", "Description", "Delivery", "Status", "Actions"]}
                  rows={rows}
                />
              )}
            </Card>
          </Layout.Section>
        </Layout>

        {/* Add/Edit Modal */}
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingRate ? "Edit Shipping Rate" : "Add Shipping Rate"}
          primaryAction={{ content: editingRate ? "Save Changes" : "Add Rate", onAction: handleSave }}
          secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField label="Rate name" value={form.name} onChange={setField("name")}
                placeholder="Standard Shipping" autoComplete="off"
                helpText="What customers see at checkout" />
              <TextField label="Service code" value={form.service_code} onChange={setField("service_code")}
                placeholder="standard" autoComplete="off"
                helpText="Unique identifier — lowercase, no spaces (e.g. standard, expedited, overnight)"
                disabled={!!editingRate} />
              <TextField label="Base price" type="number" value={form.base_price}
                onChange={setField("base_price")} prefix="$" placeholder="8.00"
                autoComplete="off" helpText="Before any surcharges" />
              <TextField label="Description (optional)" value={form.description}
                onChange={setField("description")} placeholder="3–5 business days"
                autoComplete="off" />
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
                  helpText="Lower number shown first" />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Delete Confirm */}
        <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}
          title="Delete shipping rate?"
          primaryAction={{ content: "Delete", destructive: true, onAction: confirmDelete }}
          secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}>
          <Modal.Section>
            <Text>This rate will be permanently deleted and will no longer appear at checkout.</Text>
          </Modal.Section>
        </Modal>

        {toastActive && <Toast content={toastMsg} onDismiss={() => setToastActive(false)} />}
      </Page>
    </Frame>
  );
}
