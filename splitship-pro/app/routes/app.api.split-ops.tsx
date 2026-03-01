import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import {
  buildFulfillmentInstructions,
  buildSplitPayloadContract,
} from "../models/split-plan.server";
import { authenticate } from "../shopify.server";

type Operation =
  | "generate_fulfillment_instructions"
  | "send_to_3pl"
  | "retry_3pl"
  | "ack_3pl"
  | "mark_ready_for_fulfillment"
  | "mark_fulfilled_partial"
  | "mark_fulfilled_complete";

type Payload = {
  splitPlanId?: string;
  operation?: Operation;
};

const OP_STATUS_MAP: Record<
  Exclude<
    Operation,
    "generate_fulfillment_instructions" | "send_to_3pl" | "retry_3pl" | "ack_3pl"
  >,
  string
> = {
  mark_ready_for_fulfillment: "ready_for_fulfillment",
  mark_fulfilled_partial: "fulfilled_partial",
  mark_fulfilled_complete: "fulfilled_complete",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const payload = (await request.json()) as Payload;

  if (!payload.splitPlanId) {
    return json({ error: "splitPlanId is required." }, { status: 400 });
  }

  if (!payload.operation) {
    return json({ error: "operation is required." }, { status: 400 });
  }

  const splitPlan = await db.splitPlan.findFirst({
    where: { id: payload.splitPlanId, shop: session.shop },
    include: {
      allocations: {
        include: {
          recipient: true,
        },
      },
    },
  });

  if (!splitPlan) {
    return json({ error: "Split plan not found." }, { status: 404 });
  }

  if (!splitPlan.allocations.length) {
    return json({ error: "Split plan has no allocations." }, { status: 400 });
  }

  const instructions = buildFulfillmentInstructions(splitPlan.allocations);

  if (payload.operation === "generate_fulfillment_instructions") {
    const updated = await db.splitPlan.update({
      where: { id: splitPlan.id },
      data: {
        status: "ready_for_fulfillment",
        events: {
          create: {
            eventType: "split_plan.fulfillment_instructions_generated",
            payloadJson: JSON.stringify({ instructions }),
          },
        },
      },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return json({ splitPlan: updated, instructions });
  }

  if (payload.operation === "send_to_3pl" || payload.operation === "retry_3pl") {
    const idempotencyKey =
      splitPlan.idempotencyKey ?? `${splitPlan.shop}:${splitPlan.id}:${splitPlan.deliveryAttempts + 1}`;

    const contract = buildSplitPayloadContract({
      idempotencyKey,
      splitPlanId: splitPlan.id,
      shop: splitPlan.shop,
      orderId: splitPlan.orderId,
      cartToken: splitPlan.cartToken,
      sourceLineGid: splitPlan.sourceLineGid,
      lineQuantity: splitPlan.lineQuantity,
      recipients: instructions,
    });

    // Placeholder sender (v1). In production this should POST to 3PL endpoint/middleware.
    // eslint-disable-next-line no-console
    console.log("[3PL-HANDOFF] payload", JSON.stringify(contract));

    const updated = await db.splitPlan.update({
      where: { id: splitPlan.id },
      data: {
        deliveryStatus: "sent",
        deliveryAttempts: { increment: 1 },
        lastDeliveryAt: new Date(),
        lastDeliveryError: null,
        idempotencyKey,
        events: {
          create: {
            eventType:
              payload.operation === "retry_3pl"
                ? "split_plan.delivery_retried"
                : "split_plan.delivery_sent",
            payloadJson: JSON.stringify(contract),
          },
        },
      },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return json({ splitPlan: updated, payload: contract });
  }

  if (payload.operation === "ack_3pl") {
    const updated = await db.splitPlan.update({
      where: { id: splitPlan.id },
      data: {
        deliveryStatus: "acked",
        events: {
          create: {
            eventType: "split_plan.delivery_acked",
            payloadJson: JSON.stringify({ previousStatus: splitPlan.deliveryStatus }),
          },
        },
      },
      include: {
        events: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return json({ splitPlan: updated });
  }

  if (!(payload.operation in OP_STATUS_MAP)) {
    return json({ error: "Unsupported operation." }, { status: 400 });
  }

  const nextStatus = OP_STATUS_MAP[payload.operation as keyof typeof OP_STATUS_MAP];

  const updated = await db.splitPlan.update({
    where: { id: splitPlan.id },
    data: {
      status: nextStatus,
      events: {
        create: {
          eventType: `split_plan.${nextStatus}`,
          payloadJson: JSON.stringify({
            previousStatus: splitPlan.status,
            nextStatus,
          }),
        },
      },
    },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return json({ splitPlan: updated });
};
