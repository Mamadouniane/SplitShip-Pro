import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useMemo, useState } from "react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type Recipient = {
  id: string;
  name: string;
  city: string;
  countryCode: string;
};

type SplitPlan = {
  id: string;
  sourceLineGid: string;
  lineQuantity: number;
  status: string;
  allocations: Array<{ recipient: { id: string; name: string }; quantity: number }>;
};

type AllocationRow = {
  key: string;
  recipientId: string;
  quantity: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const recipients = await prisma.recipient.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, city: true, countryCode: true },
    take: 50,
  });

  const splitPlans = await prisma.splitPlan.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
    take: 10,
    include: {
      allocations: {
        include: { recipient: { select: { id: true, name: true } } },
      },
    },
  });

  return json({ recipients, splitPlans });
};

export default function SplitPlansPage() {
  const { recipients: initialRecipients, splitPlans: initialSplitPlans } =
    useLoaderData<typeof loader>();

  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientCity, setRecipientCity] = useState("");
  const [recipientPostalCode, setRecipientPostalCode] = useState("");
  const [recipientCountryCode, setRecipientCountryCode] = useState("US");

  const [sourceLineGid, setSourceLineGid] = useState("");
  const [lineQuantity, setLineQuantity] = useState("2");
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>([
    { key: "row-1", recipientId: initialRecipients[0]?.id ?? "", quantity: "1" },
    { key: "row-2", recipientId: "", quantity: "1" },
  ]);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [editingSplitPlanId, setEditingSplitPlanId] = useState<string | null>(null);

  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
  const [splitPlans, setSplitPlans] = useState<SplitPlan[]>(initialSplitPlans);

  const parsedLineQuantity = Number(lineQuantity);

  const clientValidation = useMemo(() => {
    const errors: string[] = [];

    if (!sourceLineGid.trim()) {
      errors.push("Source line GID is required.");
    }

    if (!Number.isInteger(parsedLineQuantity) || parsedLineQuantity <= 0) {
      errors.push("Line quantity must be a positive integer.");
    }

    const activeRows = allocationRows.filter((row) => row.recipientId);

    if (!activeRows.length) {
      errors.push("At least one recipient allocation is required.");
    }

    const seen = new Set<string>();
    let allocationTotal = 0;

    for (const row of activeRows) {
      if (seen.has(row.recipientId)) {
        errors.push("Recipients cannot be duplicated.");
      }
      seen.add(row.recipientId);

      const qty = Number(row.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        errors.push("Each recipient quantity must be a positive integer.");
      } else {
        allocationTotal += qty;
      }
    }

    if (Number.isFinite(parsedLineQuantity) && allocationTotal !== parsedLineQuantity) {
      errors.push(
        `Allocated quantity (${allocationTotal}) must equal line quantity (${parsedLineQuantity}).`,
      );
    }

    return {
      valid: errors.length === 0,
      allocationTotal,
      errors,
      activeRows,
    };
  }, [allocationRows, parsedLineQuantity, sourceLineGid]);

  function updateRow(key: string, patch: Partial<AllocationRow>) {
    setAllocationRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRecipientRow() {
    const nextIndex = allocationRows.length + 1;
    setAllocationRows((prev) => [
      ...prev,
      { key: `row-${Date.now()}-${nextIndex}`, recipientId: "", quantity: "1" },
    ]);
  }

  function removeRecipientRow(key: string) {
    setAllocationRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.key !== key)));
  }

  function resetSplitPlanForm(defaultRecipientId?: string) {
    setEditingSplitPlanId(null);
    setSourceLineGid("");
    setLineQuantity("2");
    setAllocationRows([
      { key: "row-1", recipientId: defaultRecipientId ?? recipients[0]?.id ?? "", quantity: "1" },
      { key: "row-2", recipientId: "", quantity: "1" },
    ]);
  }

  function startEditSplitPlan(plan: SplitPlan) {
    setEditingSplitPlanId(plan.id);
    setSourceLineGid(plan.sourceLineGid);
    setLineQuantity(String(plan.lineQuantity));
    setAllocationRows(
      plan.allocations.map((allocation, index) => ({
        key: `edit-${plan.id}-${index}`,
        recipientId: allocation.recipient.id,
        quantity: String(allocation.quantity),
      })),
    );
    setValidationErrors([]);
    setError(null);
    setNotice(`Editing split plan ${plan.id}`);
  }

  async function refreshData() {
    const [recipientsRes, splitPlansRes] = await Promise.all([
      fetch("/app/api/recipients"),
      fetch("/app/api/split-plans"),
    ]);

    const recipientsJson = await recipientsRes.json();
    const splitPlansJson = await splitPlansRes.json();

    const nextRecipients = recipientsJson.recipients ?? [];
    setRecipients(nextRecipients);
    setSplitPlans(splitPlansJson.splitPlans ?? []);

    if (nextRecipients.length) {
      setAllocationRows((prev) => {
        if (prev.some((row) => row.recipientId)) return prev;
        return [{ ...prev[0], recipientId: nextRecipients[0].id }, ...prev.slice(1)];
      });
    }
  }

  async function createRecipient() {
    setError(null);
    setNotice(null);
    setValidationErrors([]);

    const response = await fetch("/app/api/recipients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: recipientName,
        addressLine1: recipientAddress,
        city: recipientCity,
        postalCode: recipientPostalCode,
        countryCode: recipientCountryCode,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Failed to create recipient.");
      return;
    }

    setNotice(`Recipient created: ${data.recipient.name}`);
    setRecipientName("");
    setRecipientAddress("");
    setRecipientCity("");
    setRecipientPostalCode("");
    await refreshData();
  }

  async function deleteRecipient(recipientId: string) {
    setError(null);
    setNotice(null);
    setValidationErrors([]);

    const response = await fetch("/app/api/recipients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: recipientId }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Failed to delete recipient.");
      return;
    }

    setNotice("Recipient deleted.");
    await refreshData();
  }

  async function createSplitPlan() {
    setError(null);
    setNotice(null);
    setValidationErrors([]);

    if (!clientValidation.valid) {
      setValidationErrors(clientValidation.errors);
      return;
    }

    const allocations = clientValidation.activeRows.map((row) => ({
      recipientKey: row.recipientId,
      quantity: Number(row.quantity),
    }));

    const response = await fetch("/app/api/split-plans", {
      method: editingSplitPlanId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingSplitPlanId ?? undefined,
        sourceLineGid,
        lineQuantity: parsedLineQuantity,
        allocations,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const serverValidationErrors: string[] = data.validation?.errors ?? [];
      if (serverValidationErrors.length) setValidationErrors(serverValidationErrors);
      setError(data.error ?? `Failed to ${editingSplitPlanId ? "update" : "create"} split plan.`);
      return;
    }

    setNotice(
      editingSplitPlanId
        ? `Split plan updated: ${data.splitPlan.id}`
        : `Split plan created: ${data.splitPlan.id}`,
    );
    await refreshData();
    resetSplitPlanForm();
  }

  const recipientOptions = recipients.map((recipient) => ({
    label: `${recipient.name} (${recipient.city}, ${recipient.countryCode})`,
    value: recipient.id,
  }));

  return (
    <Page>
      <TitleBar title="Split plan tester" />
      <BlockStack gap="500">
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        {error ? <Banner tone="critical">{error}</Banner> : null}
        {validationErrors.length ? (
          <Banner tone="warning" title="Validation issues">
            <List>
              {validationErrors.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </Banner>
        ) : null}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  1) Create recipient
                </Text>
                <TextField label="Name" value={recipientName} onChange={setRecipientName} autoComplete="name" />
                <TextField
                  label="Address line 1"
                  value={recipientAddress}
                  onChange={setRecipientAddress}
                  autoComplete="address-line1"
                />
                <InlineStack gap="200">
                  <TextField label="City" value={recipientCity} onChange={setRecipientCity} autoComplete="address-level2" />
                  <TextField
                    label="Postal code"
                    value={recipientPostalCode}
                    onChange={setRecipientPostalCode}
                    autoComplete="postal-code"
                  />
                  <TextField
                    label="Country code"
                    value={recipientCountryCode}
                    onChange={setRecipientCountryCode}
                    autoComplete="country"
                  />
                </InlineStack>
                <InlineStack gap="200">
                  <Button variant="primary" onClick={createRecipient}>
                    Create recipient
                  </Button>
                  <Button onClick={refreshData}>Refresh data</Button>
                </InlineStack>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Recipient book
                  </Text>
                  {recipients.length === 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No recipients yet.
                    </Text>
                  ) : (
                    <List>
                      {recipients.map((recipient) => (
                        <List.Item key={recipient.id}>
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm">
                              {recipient.name} ({recipient.city}, {recipient.countryCode})
                            </Text>
                            <Button variant="plain" tone="critical" onClick={() => deleteRecipient(recipient.id)}>
                              Delete
                            </Button>
                          </InlineStack>
                        </List.Item>
                      ))}
                    </List>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  2) {editingSplitPlanId ? "Edit split plan" : "Create split plan"}
                </Text>
                {editingSplitPlanId ? (
                  <Banner tone="info">
                    Currently editing: {editingSplitPlanId}
                  </Banner>
                ) : null}
                <TextField
                  label="Source line GID"
                  value={sourceLineGid}
                  onChange={setSourceLineGid}
                  helpText="Example: gid://shopify/LineItem/123"
                  autoComplete="off"
                />
                <TextField label="Line quantity" value={lineQuantity} onChange={setLineQuantity} autoComplete="off" />

                {allocationRows.map((row, index) => (
                  <InlineStack key={row.key} gap="200" align="start">
                    <Select
                      label={`Recipient ${index + 1}`}
                      options={[{ label: "Select recipient", value: "" }, ...recipientOptions]}
                      value={row.recipientId}
                      onChange={(value) => updateRow(row.key, { recipientId: value })}
                    />
                    <TextField
                      label="Qty"
                      value={row.quantity}
                      onChange={(value) => updateRow(row.key, { quantity: value })}
                      autoComplete="off"
                      disabled={!row.recipientId}
                    />
                    <Button
                      tone="critical"
                      variant="plain"
                      onClick={() => removeRecipientRow(row.key)}
                      disabled={allocationRows.length <= 1}
                    >
                      Remove
                    </Button>
                  </InlineStack>
                ))}

                <InlineStack gap="200">
                  <Button onClick={addRecipientRow}>Add recipient row</Button>
                </InlineStack>

                <Text as="p" variant="bodySm" tone="subdued">
                  Allocation total: {clientValidation.allocationTotal} / {lineQuantity || "0"}
                </Text>

                <InlineStack gap="200">
                  <Button variant="primary" onClick={createSplitPlan} disabled={!clientValidation.valid}>
                    {editingSplitPlanId ? "Update split plan" : "Create split plan"}
                  </Button>
                  {editingSplitPlanId ? (
                    <Button onClick={() => resetSplitPlanForm()}>
                      Cancel edit
                    </Button>
                  ) : null}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Latest split plans
                </Text>
                {splitPlans.length === 0 ? (
                  <Text as="p" variant="bodyMd">
                    No split plans yet.
                  </Text>
                ) : (
                  <List>
                    {splitPlans.map((plan) => (
                      <List.Item key={plan.id}>
                        <InlineStack align="space-between">
                          <Text as="span" variant="bodyMd">
                            {plan.id} — qty {plan.lineQuantity} — {plan.status}
                          </Text>
                          <Button variant="plain" onClick={() => startEditSplitPlan(plan)}>
                            Edit
                          </Button>
                        </InlineStack>
                        <List>
                          {plan.allocations.map((allocation, idx) => (
                            <List.Item key={`${plan.id}-${idx}`}>
                              Qty {allocation.quantity} — {allocation.recipient.name}
                            </List.Item>
                          ))}
                        </List>
                      </List.Item>
                    ))}
                  </List>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
