import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { buildFulfillmentInstructions } from "../models/split-plan.server";
import { authenticate } from "../shopify.server";

type Payload = {
  splitPlanId?: string;
  operation?: "generate_fulfillment_instructions";
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const payload = (await request.json()) as Payload;

  if (!payload.splitPlanId) {
    return json({ error: "splitPlanId is required." }, { status: 400 });
  }

  if (payload.operation !== "generate_fulfillment_instructions") {
    return json({ error: "Unsupported operation." }, { status: 400 });
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
};
