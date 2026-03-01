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
  deliveryStatus?: string;
  deliveryAttempts?: number;
  lastDeliveryError?: string | null;
  lastDeliveryAt?: string | null;
  allocations: Array<{ recipient: { id: string; name: string }; quantity: number }>;
  events?: Array<{ eventType: string; payloadJson?: string | null }>;
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
      events: {
        orderBy: { createdAt: "desc" },
        take: 1,
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [planSearch, setPlanSearch] = useState("");

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

  async function deleteSplitPlan(splitPlanId: string) {
    setError(null);
    setNotice(null);

    const response = await fetch("/app/api/split-plans", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: splitPlanId }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Failed to delete split plan.");
      return;
    }

    setNotice("Split plan deleted.");
    if (editingSplitPlanId === splitPlanId) resetSplitPlanForm();
    await refreshData();
  }

  async function updateSplitPlanStatus(
    splitPlanId: string,
    operation:
      | "mark_ready_for_fulfillment"
      | "mark_fulfilled_partial"
      | "mark_fulfilled_complete",
  ) {
    setError(null);
    setNotice(null);

    const response = await fetch("/app/api/split-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splitPlanId, operation }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Failed to update split plan status.");
      return;
    }

    setNotice(`Split plan ${splitPlanId} updated.`);
    await refreshData();
  }

  async function sendTo3pl(
    splitPlanId: string,
    operation: "send_to_3pl" | "retry_3pl" | "ack_3pl",
  ) {
    setError(null);
    setNotice(null);

    const response = await fetch("/app/api/split-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ splitPlanId, operation }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "3PL handoff operation failed.");
      return;
    }

    setNotice(`3PL operation '${operation}' completed for ${splitPlanId}.`);
    await refreshData();
  }

  const recipientOptions = recipients.map((recipient) => ({
    label: `${recipient.name} (${recipient.city}, ${recipient.countryCode})`,
    value: recipient.id,
  }));

  const filteredSplitPlans = splitPlans.filter((plan) => {
    const statusMatch = statusFilter === "all" || plan.status === statusFilter;
    const search = planSearch.trim().toLowerCase();
    const searchMatch =
      !search ||
      plan.id.toLowerCase().includes(search) ||
      plan.sourceLineGid.toLowerCase().includes(search);
    return statusMatch && searchMatch;
  });

  const knownStatuses = Array.from(new Set(splitPlans.map((plan) => plan.status)));

  const statusOptions = [
    { label: "All statuses", value: "all" },
    ...knownStatuses.map((status) => ({ label: status, value: status })),
  ];

  const recipientCount = recipients.length;

  const canAddRow = allocationRows.length < Math.max(1, recipientCount);

  const allocationHeading = editingSplitPlanId ? "Edit split plan" : "Create split plan";

  const showNoPlans = filteredSplitPlans.length === 0;

  function getLatestInstructionSummary(plan: SplitPlan) {
    const latestEvent = plan.events?.[0];
    if (
      !latestEvent ||
      latestEvent.eventType !== "split_plan.fulfillment_instructions_generated" ||
      !latestEvent.payloadJson
    ) {
      return null;
    }

    try {
      const parsed = JSON.parse(latestEvent.payloadJson) as {
        instructions?: Array<{ recipientName?: string; quantity?: number }>;
      };
      const count = parsed.instructions?.length ?? 0;
      const qtyTotal =
        parsed.instructions?.reduce((sum, item) => sum + (item.quantity ?? 0), 0) ?? 0;
      return `Instructions: ${count} recipient(s), ${qtyTotal} total qty`;
    } catch {
      return "Instructions generated";
    }
  }

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
                  2) {allocationHeading}
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
                  <Button onClick={addRecipientRow} disabled={!canAddRow}>
                    Add recipient row
                  </Button>
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
                <InlineStack gap="200">
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={statusFilter}
                    onChange={setStatusFilter}
                  />
                  <TextField
                    label="Search"
                    value={planSearch}
                    onChange={setPlanSearch}
                    autoComplete="off"
                    placeholder="Plan id or line GID"
                  />
                </InlineStack>

                {showNoPlans ? (
                  <Text as="p" variant="bodyMd">
                    No split plans found for the current filter.
                  </Text>
                ) : (
                  <List>
                    {filteredSplitPlans.map((plan) => (
                      <List.Item key={plan.id}>
                        <InlineStack align="space-between" gap="200">
                          <Text as="span" variant="bodyMd">
                            {plan.id} — qty {plan.lineQuantity} — status {plan.status} — delivery {plan.deliveryStatus ?? "pending"}
                          </Text>
                          <InlineStack gap="200">
                            <Button variant="plain" onClick={() => startEditSplitPlan(plan)}>
                              Edit
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() => sendTo3pl(plan.id, "send_to_3pl")}
                            >
                              Send to 3PL
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() => sendTo3pl(plan.id, "retry_3pl")}
                            >
                              Retry 3PL
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() => sendTo3pl(plan.id, "ack_3pl")}
                            >
                              Ack 3PL
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() =>
                                updateSplitPlanStatus(plan.id, "mark_ready_for_fulfillment")
                              }
                            >
                              Mark ready
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() =>
                                updateSplitPlanStatus(plan.id, "mark_fulfilled_partial")
                              }
                            >
                              Mark partial
                            </Button>
                            <Button
                              variant="plain"
                              onClick={() =>
                                updateSplitPlanStatus(plan.id, "mark_fulfilled_complete")
                              }
                            >
                              Mark complete
                            </Button>
                            <Button
                              variant="plain"
                              tone="critical"
                              onClick={() => deleteSplitPlan(plan.id)}
                            >
                              Delete
                            </Button>
                          </InlineStack>
                        </InlineStack>
                        <List>
                          {plan.allocations.map((allocation, idx) => (
                            <List.Item key={`${plan.id}-${idx}`}>
                              Qty {allocation.quantity} — {allocation.recipient.name}
                            </List.Item>
                          ))}
                          {getLatestInstructionSummary(plan) ? (
                            <List.Item>{getLatestInstructionSummary(plan)}</List.Item>
                          ) : null}
                          <List.Item>
                            Delivery attempts: {plan.deliveryAttempts ?? 0}
                            {plan.lastDeliveryAt ? ` • last at ${new Date(plan.lastDeliveryAt).toLocaleString()}` : ""}
                          </List.Item>
                          {plan.lastDeliveryError ? (
                            <List.Item>Last delivery error: {plan.lastDeliveryError}</List.Item>
                          ) : null}
                          {plan.events?.[0]?.eventType ? (
                            <List.Item>Latest event: {plan.events[0].eventType}</List.Item>
                          ) : null}
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
