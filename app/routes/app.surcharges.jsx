import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useFetcher } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Tabs,
  DataTable, Badge, Modal, FormLayout, TextField, Select, Thumbnail,
  EmptyState, Toast, Frame, Box, Icon, Divider,
} from "@shopify/polaris";
import { PlusIcon, EditIcon, DeleteIcon, SearchIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server.js";
import {
  getSurchargeRules, upsertSurchargeRule, deleteSurchargeRule, toggleSurchargeRule,
} from "../db.server.js";

const PRODUCTS_QUERY = `
  query getProducts($query: String, $first: Int!) {
    products(query: $query, first: $first) {
      edges {
        node {
          id title handle
          featuredImage { url }
          variants(first: 1) { edges { node { id price } } }
        }
      }
    }
  }
`;

const COLLECTIONS_QUERY = `
  query getCollections($query: String, $first: Int!) {
    collections(query: $query, first: $first) {
      edges {
        node {
          id title handle
          image { url }
          productsCount { count }
        }
      }
    }
  }
`;

export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const rules = await getSurchargeRules(session.shop);
    return json({ rules, shopDomain: session.shop });
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

    if (intent === "upsert") {
      const rule = {
        rule_type: formData.get("rule_type"),
        shopify_id: formData.get("shopify_id"),
        shopify_title: formData.get("shopify_title"),
        shopify_image_url: formData.get("shopify_image_url") || null,
        surcharge_type: formData.get("surcharge_type"),
        surcharge_amount: parseFloat(formData.get("surcharge_amount")),
        surcharge_label: formData.get("surcharge_label"),
        applies_per: formData.get("applies_per"),
        is_active: formData.get("is_active") === "true",
        priority: parseInt(formData.get("priority") || "0"),
      };
      if (isNaN(rule.surcharge_amount) || rule.surcharge_amount < 0) {
        return json({ error: "Invalid surcharge amount" }, { status: 400 });
      }
      const result = await upsertSurchargeRule(shopDomain, rule);
      return json({ success: true, rule: result });
    }

    if (intent === "delete") {
      await deleteSurchargeRule(shopDomain, formData.get("rule_id"));
      return json({ success: true });
    }

    if (intent === "toggle") {
      const result = await toggleSurchargeRule(
        shopDomain, formData.get("rule_id"), formData.get("is_active") === "true"
      );
      return json({ success: true, rule: result });
    }

    if (intent === "search_products") {
      const response = await admin.graphql(PRODUCTS_QUERY, {
        variables: { query: formData.get("query") || "", first: 20 },
      });
      const data = await response.json();
      const products = data.data.products.edges.map(({ node }) => ({
        id: node.id, title: node.title,
        imageUrl: node.featuredImage?.url,
        price: node.variants.edges[0]?.node?.price,
      }));
      return json({ products });
    }

    if (intent === "search_collections") {
      const response = await admin.graphql(COLLECTIONS_QUERY, {
        variables: { query: formData.get("query") || "", first: 20 },
      });
      const data = await response.json();
      const collections = data.data.collections.edges.map(({ node }) => ({
        id: node.id, title: node.title,
        imageUrl: node.image?.url,
        productsCount: node.productsCount?.count,
      }));
      return json({ collections });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("Surcharges action error:", err);
    return json({ error: err.message }, { status: 500 });
  }
}

const emptyForm = {
  rule_type: "product", surcharge_type: "fixed", surcharge_amount: "",
  surcharge_label: "Shipping Surcharge", applies_per: "order",
  is_active: true, priority: "0",
};

export default function SurchargesPage() {
  const { rules } = useLoaderData();
  const submit = useSubmit();
  const fetcher = useFetcher();

  const [selectedTab, setSelectedTab] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [toastActive, setToastActive] = useState(false);

  function showToast(msg) { setToastMsg(msg); setToastActive(true); }
  function setField(key) { return (val) => setForm((f) => ({ ...f, [key]: val })); }

  const tabs = [
    { id: "all", content: `All (${rules.length})`, panelID: "all" },
    { id: "products", content: `Products (${rules.filter((r) => r.rule_type === "product").length})`, panelID: "products" },
    { id: "collections", content: `Collections (${rules.filter((r) => r.rule_type === "collection").length})`, panelID: "collections" },
  ];

  const filteredRules = selectedTab === 0 ? rules
    : selectedTab === 1 ? rules.filter((r) => r.rule_type === "product")
    : rules.filter((r) => r.rule_type === "collection");

  function openAdd(type = "product") {
    setEditingRule(null);
    setSelectedResource(null);
    setSearchQuery("");
    setSearchResults([]);
    setForm({ ...emptyForm, rule_type: type });
    setModalOpen(true);
  }

  function openEdit(rule) {
    setEditingRule(rule);
    setSelectedResource({ id: rule.shopify_id, title: rule.shopify_title, imageUrl: rule.shopify_image_url });
    setForm({
      rule_type: rule.rule_type, surcharge_type: rule.surcharge_type,
      surcharge_amount: String(rule.surcharge_amount),
      surcharge_label: rule.surcharge_label,
      applies_per: rule.applies_per, is_active: rule.is_active,
      priority: String(rule.priority),
    });
    setModalOpen(true);
  }

  function handleSearch(query) {
    setSearchQuery(query);
    setSelectedResource(null);
    if (!query || query.length < 2) { setSearchResults([]); return; }
    const fd = new FormData();
    fd.append("intent", form.rule_type === "product" ? "search_products" : "search_collections");
    fd.append("query", query);
    fetcher.submit(fd, { method: "post" });
  }

  const fetcherProducts = fetcher.data?.products;
  const fetcherCollections = fetcher.data?.collections;
  if (fetcherProducts && fetcherProducts !== searchResults) setSearchResults(fetcherProducts);
  if (fetcherCollections && fetcherCollections !== searchResults) setSearchResults(fetcherCollections);

  function handleSave() {
    const resource = selectedResource || { id: editingRule?.shopify_id, title: editingRule?.shopify_title, imageUrl: editingRule?.shopify_image_url };
    const fd = new FormData();
    fd.append("intent", "upsert");
    fd.append("rule_type", form.rule_type);
    fd.append("shopify_id", resource.id);
    fd.append("shopify_title", resource.title);
    fd.append("shopify_image_url", resource.imageUrl || "");
    fd.append("surcharge_type", form.surcharge_type);
    fd.append("surcharge_amount", form.surcharge_amount);
    fd.append("surcharge_label", form.surcharge_label);
    fd.append("applies_per", form.applies_per);
    fd.append("is_active", String(form.is_active));
    fd.append("priority", form.priority);
    submit(fd, { method: "post" });
    setModalOpen(false);
    showToast(editingRule ? "Rule updated" : "Rule created");
  }

  function handleDelete(id) { setDeletingId(id); setDeleteModalOpen(true); }

  function confirmDelete() {
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("rule_id", deletingId);
    submit(fd, { method: "post" });
    setDeleteModalOpen(false);
    showToast("Rule deleted");
  }

  function handleToggle(rule) {
    const fd = new FormData();
    fd.append("intent", "toggle");
    fd.append("rule_id", rule.id);
    fd.append("is_active", String(!rule.is_active));
    submit(fd, { method: "post" });
  }

  const rows = filteredRules.map((rule) => [
    <InlineStack gap="300" blockAlign="center">
      {rule.shopify_image_url
        ? <Thumbnail source={rule.shopify_image_url} size="small" alt="" />
        : <Box width="40px" minHeight="40px" background="bg-surface-secondary" borderRadius="100" />}
      <BlockStack gap="050">
        <Text fontWeight="semibold">{rule.shopify_title}</Text>
      </BlockStack>
    </InlineStack>,
    <Badge tone={rule.rule_type === "product" ? "info" : "attention"}>
      {rule.rule_type === "product" ? "Product" : "Collection"}
    </Badge>,
    <BlockStack gap="050">
      <Text fontWeight="semibold">
        {rule.surcharge_type === "fixed"
          ? `+$${parseFloat(rule.surcharge_amount).toFixed(2)}`
          : `+${rule.surcharge_amount}%`}
      </Text>
      <Text variant="bodySm" tone="subdued">per {rule.applies_per}</Text>
    </BlockStack>,
    rule.surcharge_label,
    <Button variant="plain" onClick={() => handleToggle(rule)}>
      <Badge tone={rule.is_active ? "success" : "critical"}>
        {rule.is_active ? "Active" : "Inactive"}
      </Badge>
    </Button>,
    <InlineStack gap="200">
      <Button variant="plain" icon={EditIcon} onClick={() => openEdit(rule)} accessibilityLabel="Edit" />
      <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => handleDelete(rule.id)} accessibilityLabel="Delete" />
    </InlineStack>,
  ]);

  return (
    <Frame>
      <Page
        title="Surcharge Rules"
        subtitle="Add extra shipping cost when specific products or collections are in the cart"
        primaryAction={<Button variant="primary" icon={PlusIcon} onClick={() => openAdd("product")}>Add Product Rule</Button>}
        secondaryActions={[{ content: "Add Collection Rule", onAction: () => openAdd("collection") }]}
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
                <Box padding="0">
                  {filteredRules.length === 0 ? (
                    <Box padding="800">
                      <EmptyState
                        heading="No surcharge rules yet"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        action={{ content: "Add Product Rule", onAction: () => openAdd("product") }}
                      >
                        <Text>
                          Create rules to add surcharges to shipping rates when certain products
                          or collections are in the cart. The surcharge is added to all your base
                          shipping rates automatically.
                        </Text>
                      </EmptyState>
                    </Box>
                  ) : (
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                      headings={["Product / Collection", "Type", "Surcharge", "Label", "Status", "Actions"]}
                      rows={rows}
                    />
                  )}
                </Box>
              </Tabs>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Add/Edit Modal */}
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingRule ? "Edit Surcharge Rule" : "Add Surcharge Rule"}
          primaryAction={{ content: editingRule ? "Save Changes" : "Add Rule", onAction: handleSave }}
          secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
        >
          <Modal.Section>
            <FormLayout>
              <Select label="Apply surcharge when cart contains a"
                options={[{ label: "Specific Product", value: "product" }, { label: "Entire Collection", value: "collection" }]}
                value={form.rule_type}
                onChange={(v) => { setForm((f) => ({ ...f, rule_type: v })); setSelectedResource(null); setSearchResults([]); setSearchQuery(""); }}
                disabled={!!editingRule} />

              {!editingRule ? (
                <BlockStack gap="200">
                  <TextField
                    label={form.rule_type === "product" ? "Search Products" : "Search Collections"}
                    value={searchQuery} onChange={handleSearch}
                    placeholder={form.rule_type === "product" ? "Start typing a product name..." : "Start typing a collection name..."}
                    prefix={<Icon source={SearchIcon} />} autoComplete="off" />
                  {searchResults.length > 0 && !selectedResource && (
                    <Card padding="0">
                      {searchResults.map((result) => (
                        <Box key={result.id} padding="300" borderBlockEndWidth="025" borderColor="border">
                          <button
                            onClick={() => { setSelectedResource(result); setSearchQuery(result.title); setSearchResults([]); }}
                            style={{ background: "none", border: "none", width: "100%", cursor: "pointer", textAlign: "left" }}
                          >
                            <InlineStack gap="300" blockAlign="center">
                              {result.imageUrl && <Thumbnail source={result.imageUrl} size="small" alt="" />}
                              <BlockStack gap="050">
                                <Text fontWeight="semibold">{result.title}</Text>
                                {result.price && <Text tone="subdued">${result.price}</Text>}
                                {result.productsCount !== undefined && <Text tone="subdued">{result.productsCount} products</Text>}
                              </BlockStack>
                            </InlineStack>
                          </button>
                        </Box>
                      ))}
                    </Card>
                  )}
                  {selectedResource && (
                    <Card>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          {selectedResource.imageUrl && <Thumbnail source={selectedResource.imageUrl} size="small" alt="" />}
                          <Text fontWeight="semibold">{selectedResource.title}</Text>
                        </InlineStack>
                        <Button variant="plain" tone="critical" onClick={() => { setSelectedResource(null); setSearchQuery(""); }}>Remove</Button>
                      </InlineStack>
                    </Card>
                  )}
                </BlockStack>
              ) : (
                <Card>
                  <InlineStack gap="300" blockAlign="center">
                    {editingRule.shopify_image_url && <Thumbnail source={editingRule.shopify_image_url} size="small" alt="" />}
                    <Text fontWeight="semibold">{editingRule.shopify_title}</Text>
                  </InlineStack>
                </Card>
              )}

              <Divider />

              <Select label="Surcharge type"
                options={[
                  { label: "Fixed amount added to shipping (e.g. +$5.00)", value: "fixed" },
                  { label: "Percentage of item price (e.g. +5%)", value: "percentage" },
                ]}
                value={form.surcharge_type}
                onChange={setField("surcharge_type")} />

              <TextField label="Surcharge amount" type="number" value={form.surcharge_amount}
                onChange={setField("surcharge_amount")}
                prefix={form.surcharge_type === "fixed" ? "$" : ""}
                suffix={form.surcharge_type === "percentage" ? "%" : ""}
                placeholder={form.surcharge_type === "fixed" ? "5.00" : "5"}
                autoComplete="off"
                helpText="Added to ALL active shipping rates when this product/collection is in the cart" />

              <TextField label="Surcharge label (internal reference)" value={form.surcharge_label}
                onChange={setField("surcharge_label")} autoComplete="off"
                helpText="For your reference only — not shown to customers" />

              <Select label="Charge surcharge"
                options={[
                  { label: "Once per order (regardless of quantity)", value: "order" },
                  { label: "Per item quantity", value: "item" },
                ]}
                value={form.applies_per}
                onChange={setField("applies_per")} />

              <FormLayout.Group>
                <Select label="Status"
                  options={[{ label: "Active", value: "true" }, { label: "Inactive", value: "false" }]}
                  value={String(form.is_active)}
                  onChange={(v) => setForm((f) => ({ ...f, is_active: v === "true" }))} />
                <TextField label="Priority" type="number" value={form.priority}
                  onChange={setField("priority")} autoComplete="off"
                  helpText="Higher = applied first when multiple rules match" />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>

        {/* Delete Confirm */}
        <Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}
          title="Delete surcharge rule?"
          primaryAction={{ content: "Delete", destructive: true, onAction: confirmDelete }}
          secondaryActions={[{ content: "Cancel", onAction: () => setDeleteModalOpen(false) }]}>
          <Modal.Section>
            <Text>This rule will be permanently deleted.</Text>
          </Modal.Section>
        </Modal>

        {toastActive && <Toast content={toastMsg} onDismiss={() => setToastActive(false)} />}
      </Page>
    </Frame>
  );
}
