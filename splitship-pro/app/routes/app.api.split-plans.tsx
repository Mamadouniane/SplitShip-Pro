import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import {
  validateRecipientAllocations,
  type RecipientInput,
} from "../models/split-plan.server";
import { authenticate } from "../shopify.server";

type CreateSplitPlanPayload = {
  id?: string;
  sourceLineGid: string;
  lineQuantity: number;
  cartToken?: string;
  orderId?: string;
  allocations: RecipientInput[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const splitPlans = await prisma.splitPlan.findMany({
    where: { shop: session.shop },
    include: {
      allocations: {
        include: { recipient: true },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return json({ splitPlans });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const method = request.method.toUpperCase();
  const payload = (await request.json()) as CreateSplitPlanPayload;

  if (method === "POST") {
    const validation = validateRecipientAllocations(
      payload.lineQuantity,
      payload.allocations ?? [],
    );

    if (!validation.valid) {
      return json({ error: "Allocation validation failed.", validation }, { status: 400 });
    }

    const recipientIds = payload.allocations.map((a) => a.recipientKey);
    const recipients = await prisma.recipient.findMany({
      where: {
        id: { in: recipientIds },
        shop: session.shop,
      },
      select: { id: true },
    });

    if (recipients.length !== recipientIds.length) {
      return json(
        { error: "Some recipients are missing or not accessible for this shop." },
        { status: 400 },
      );
    }

    const splitPlan = await prisma.splitPlan.create({
      data: {
        shop: session.shop,
        sourceLineGid: payload.sourceLineGid,
        lineQuantity: payload.lineQuantity,
        cartToken: payload.cartToken || null,
        orderId: payload.orderId || null,
        status: "draft",
        allocations: {
          create: payload.allocations.map((allocation) => ({
            recipientId: allocation.recipientKey,
            quantity: allocation.quantity,
          })),
        },
        events: {
          create: {
            eventType: "split_plan.created",
            payloadJson: JSON.stringify({
              lineQuantity: payload.lineQuantity,
              allocatedQuantity: validation.allocatedQuantity,
            }),
          },
        },
      },
      include: {
        allocations: {
          include: { recipient: true },
        },
        events: true,
      },
    });

    return json({ splitPlan }, { status: 201 });
  }

  if (method === "PUT") {
    if (!payload.id) return json({ error: "Split plan id is required." }, { status: 400 });

    const existing = await prisma.splitPlan.findFirst({
      where: { id: payload.id, shop: session.shop },
      select: { id: true },
    });

    if (!existing) return json({ error: "Split plan not found." }, { status: 404 });

    const validation = validateRecipientAllocations(
      payload.lineQuantity,
      payload.allocations ?? [],
    );

    if (!validation.valid) {
      return json({ error: "Allocation validation failed.", validation }, { status: 400 });
    }

    const recipientIds = payload.allocations.map((a) => a.recipientKey);
    const recipients = await prisma.recipient.findMany({
      where: {
        id: { in: recipientIds },
        shop: session.shop,
      },
      select: { id: true },
    });

    if (recipients.length !== recipientIds.length) {
      return json(
        { error: "Some recipients are missing or not accessible for this shop." },
        { status: 400 },
      );
    }

    const splitPlan = await prisma.splitPlan.update({
      where: { id: payload.id },
      data: {
        sourceLineGid: payload.sourceLineGid,
        lineQuantity: payload.lineQuantity,
        cartToken: payload.cartToken || null,
        orderId: payload.orderId || null,
        allocations: {
          deleteMany: {},
          create: payload.allocations.map((allocation) => ({
            recipientId: allocation.recipientKey,
            quantity: allocation.quantity,
          })),
        },
        events: {
          create: {
            eventType: "split_plan.updated",
            payloadJson: JSON.stringify({
              lineQuantity: payload.lineQuantity,
              allocatedQuantity: validation.allocatedQuantity,
            }),
          },
        },
      },
      include: {
        allocations: {
          include: { recipient: true },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    return json({ splitPlan });
  }

  if (method === "DELETE") {
    if (!payload.id) return json({ error: "Split plan id is required." }, { status: 400 });

    const existing = await prisma.splitPlan.findFirst({
      where: { id: payload.id, shop: session.shop },
      select: { id: true },
    });

    if (!existing) return json({ error: "Split plan not found." }, { status: 404 });

    await prisma.splitPlan.delete({ where: { id: payload.id } });
    return json({ deleted: true });
  }

  return json({ error: `Method ${method} not supported.` }, { status: 405 });
};
