import type { ActionFunctionArgs } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  const orderPayload = payload as {
    id?: number;
    admin_graphql_api_id?: string;
    cart_token?: string;
    name?: string;
  };

  console.log(`Received ${topic} webhook for ${shop}`, {
    orderId: orderPayload.admin_graphql_api_id,
    cartToken: orderPayload.cart_token,
  });

  if (!orderPayload.cart_token && !orderPayload.admin_graphql_api_id) {
    return new Response();
  }

  const matchingPlans = await db.splitPlan.findMany({
    where: {
      shop,
      OR: [
        orderPayload.admin_graphql_api_id
          ? { orderId: orderPayload.admin_graphql_api_id }
          : undefined,
        orderPayload.cart_token ? { cartToken: orderPayload.cart_token } : undefined,
      ].filter(Boolean) as Array<{ orderId?: string; cartToken?: string }>,
    },
    select: { id: true },
  });

  if (!matchingPlans.length) {
    return new Response();
  }

  await db.$transaction(
    matchingPlans.map((plan) =>
      db.splitPlan.update({
        where: { id: plan.id },
        data: {
          orderId: orderPayload.admin_graphql_api_id ?? undefined,
          status: "order_created",
          events: {
            create: {
              eventType: "order.created.webhook",
              payloadJson: JSON.stringify({
                orderId: orderPayload.admin_graphql_api_id,
                cartToken: orderPayload.cart_token,
                orderName: orderPayload.name,
              }),
            },
          },
        },
      }),
    ),
  );

  return new Response();
};
