import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Badge,
  BlockStack,
  Box,
  Card,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="SplitShip Pro" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Sprint 1 Foundation
                </Text>
                <Text as="p" variant="bodyMd">
                  This app enables merchants to split a line item quantity across
                  multiple recipients while enforcing strict quantity integrity.
                </Text>
                <InlineStack gap="200">
                  <Badge tone="info">Cart split UX</Badge>
                  <Badge tone="info">Recipient book</Badge>
                  <Badge tone="info">Allocation validation</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Core rule
                </Text>
                <Box
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <Text as="p" variant="bodySm" tone="subdued">
                    Sum of recipient quantities must exactly equal the source line
                    item quantity.
                  </Text>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              Sprint 1 checklist
            </Text>
            <List>
              <List.Item>
                Add persistent models for recipients, split plans, allocations,
                and audit events
              </List.Item>
              <List.Item>
                Implement server-side quantity allocation validation helper
              </List.Item>
              <List.Item>
                Wire split plan APIs and cart action endpoints
              </List.Item>
              <List.Item>
                Add webhook processing and idempotent order mapping
              </List.Item>
            </List>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
