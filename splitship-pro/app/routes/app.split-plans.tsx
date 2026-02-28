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
  allocations: Array<{ recipient: { name: string }; quantity: number }>;
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
        include: { recipient: { select: { name: true } } },
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
  const [firstRecipientId, setFirstRecipientId] = useState(
    initialRecipients[0]?.id ?? "",
  );
  const [firstRecipientQty, setFirstRecipientQty] = useState("1");
  const [secondRecipientId, setSecondRecipientId] = useState("");
  const [secondRecipientQty, setSecondRecipientQty] = useState("1");

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
  const [splitPlans, setSplitPlans] = useState<SplitPlan[]>(initialSplitPlans);

  const parsedLineQuantity = Number(lineQuantity);
  const parsedFirstQty = Number(firstRecipientQty);
  const parsedSecondQty = Number(secondRecipientQty);

  const clientValidation = useMemo(() => {
    const errors: string[] = [];

    if (!sourceLineGid.trim()) {
      errors.push("Source line GID is required.");
    }

    if (!Number.isInteger(parsedLineQuantity) || parsedLineQuantity <= 0) {
      errors.push("Line quantity must be a positive integer.");
    }

    if (!firstRecipientId) {
      errors.push("First recipient is required.");
    }

    if (!Number.isInteger(parsedFirstQty) || parsedFirstQty <= 0) {
      errors.push("First recipient quantity must be a positive integer.");
    }

    let allocationTotal = parsedFirstQty;

    if (secondRecipientId) {
      if (secondRecipientId === firstRecipientId) {
        errors.push("Second recipient must be different from first recipient.");
      }

      if (!Number.isInteger(parsedSecondQty) || parsedSecondQty <= 0) {
        errors.push("Second recipient quantity must be a positive integer.");
      }

      allocationTotal += parsedSecondQty;
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
    };
  }, [
    firstRecipientId,
    parsedFirstQty,
    parsedLineQuantity,
    parsedSecondQty,
    secondRecipientId,
    sourceLineGid,
  ]);

  async function refreshData() {
    const [recipientsRes, splitPlansRes] = await Promise.all([
      fetch("/app/api/recipients"),
      fetch("/app/api/split-plans"),
    ]);

    const recipientsJson = await recipientsRes.json();
    const splitPlansJson = await splitPlansRes.json();

    setRecipients(recipientsJson.recipients ?? []);
    setSplitPlans(splitPlansJson.splitPlans ?? []);

    if (!firstRecipientId && recipientsJson.recipients?.length) {
      setFirstRecipientId(recipientsJson.recipients[0].id);
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

    const allocations = [
      { recipientKey: firstRecipientId, quantity: parsedFirstQty },
      ...(secondRecipientId
        ? [{ recipientKey: secondRecipientId, quantity: parsedSecondQty }]
        : []),
    ];

    const response = await fetch("/app/api/split-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceLineGid,
        lineQuantity: parsedLineQuantity,
        allocations,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const serverValidationErrors: string[] = data.validation?.errors ?? [];
      if (serverValidationErrors.length) setValidationErrors(serverValidationErrors);
      setError(data.error ?? "Failed to create split plan.");
      return;
    }

    setNotice(`Split plan created: ${data.splitPlan.id}`);
    await refreshData();
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
                <TextField
                  label="Name"
                  value={recipientName}
                  onChange={setRecipientName}
                  autoComplete="name"
                />
                <TextField
                  label="Address line 1"
                  value={recipientAddress}
                  onChange={setRecipientAddress}
                  autoComplete="address-line1"
                />
                <InlineStack gap="200">
                  <TextField
                    label="City"
                    value={recipientCity}
                    onChange={setRecipientCity}
                    autoComplete="address-level2"
                  />
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
                            <Button
                              variant="plain"
                              tone="critical"
                              onClick={() => deleteRecipient(recipient.id)}
                            >
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
                  2) Create split plan
                </Text>
                <TextField
                  label="Source line GID"
                  value={sourceLineGid}
                  onChange={setSourceLineGid}
                  helpText="Example: gid://shopify/LineItem/123"
                  autoComplete="off"
                />
                <InlineStack gap="200">
                  <TextField
                    label="Line quantity"
                    value={lineQuantity}
                    onChange={setLineQuantity}
                    autoComplete="off"
                  />
                  <TextField
                    label="First recipient qty"
                    value={firstRecipientQty}
                    onChange={setFirstRecipientQty}
                    autoComplete="off"
                  />
                  <TextField
                    label="Second recipient qty"
                    value={secondRecipientQty}
                    onChange={setSecondRecipientQty}
                    autoComplete="off"
                    disabled={!secondRecipientId}
                  />
                </InlineStack>
                <InlineStack gap="200">
                  <Select
                    label="First recipient"
                    options={recipientOptions}
                    value={firstRecipientId}
                    onChange={setFirstRecipientId}
                  />
                  <Select
                    label="Second recipient (optional)"
                    options={[{ label: "None", value: "" }, ...recipientOptions]}
                    value={secondRecipientId}
                    onChange={setSecondRecipientId}
                  />
                </InlineStack>

                <Text as="p" variant="bodySm" tone="subdued">
                  Allocation total: {clientValidation.allocationTotal} / {lineQuantity || "0"}
                </Text>

                <Button
                  variant="primary"
                  onClick={createSplitPlan}
                  disabled={!clientValidation.valid}
                >
                  Create split plan
                </Button>
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
                        <Text as="span" variant="bodyMd">
                          {plan.id} — qty {plan.lineQuantity} — {plan.status}
                        </Text>
                        <List>
                          {plan.allocations.map((allocation, idx) => (
                            <List.Item key={`${plan.id}-${idx}`}>
                              {allocation.recipient.name}: {allocation.quantity}
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
