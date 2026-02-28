import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type RecipientPayload = {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province?: string;
  postalCode: string;
  countryCode: string;
};

function normalize(payload: RecipientPayload) {
  return {
    name: payload.name?.trim(),
    email: payload.email?.trim() || null,
    phone: payload.phone?.trim() || null,
    addressLine1: payload.addressLine1?.trim(),
    addressLine2: payload.addressLine2?.trim() || null,
    city: payload.city?.trim(),
    province: payload.province?.trim() || null,
    postalCode: payload.postalCode?.trim(),
    countryCode: payload.countryCode?.trim().toUpperCase(),
  };
}

function validate(payload: ReturnType<typeof normalize>) {
  const required = [
    payload.name,
    payload.addressLine1,
    payload.city,
    payload.postalCode,
    payload.countryCode,
  ];

  if (required.some((v) => !v)) {
    return "Missing required recipient fields.";
  }

  if (payload.countryCode.length < 2 || payload.countryCode.length > 3) {
    return "countryCode must be 2-3 characters.";
  }

  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const recipients = await prisma.recipient.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
  });

  return json({ recipients });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const method = request.method.toUpperCase();
  const payload = (await request.json()) as RecipientPayload;

  if (method === "POST") {
    const normalized = normalize(payload);
    const validationError = validate(normalized);
    if (validationError) return json({ error: validationError }, { status: 400 });

    const recipient = await prisma.recipient.create({
      data: { shop: session.shop, ...normalized },
    });

    return json({ recipient }, { status: 201 });
  }

  if (method === "PUT") {
    if (!payload.id) return json({ error: "Recipient id is required." }, { status: 400 });

    const existing = await prisma.recipient.findFirst({
      where: { id: payload.id, shop: session.shop },
    });

    if (!existing) return json({ error: "Recipient not found." }, { status: 404 });

    const normalized = normalize(payload);
    const validationError = validate(normalized);
    if (validationError) return json({ error: validationError }, { status: 400 });

    const recipient = await prisma.recipient.update({
      where: { id: payload.id },
      data: normalized,
    });

    return json({ recipient });
  }

  if (method === "DELETE") {
    if (!payload.id) return json({ error: "Recipient id is required." }, { status: 400 });

    const existing = await prisma.recipient.findFirst({
      where: { id: payload.id, shop: session.shop },
      select: { id: true },
    });

    if (!existing) return json({ error: "Recipient not found." }, { status: 404 });

    try {
      await prisma.recipient.delete({ where: { id: payload.id } });
      return json({ deleted: true });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        return json(
          {
            error:
              "Recipient is used in split plans and cannot be deleted yet.",
          },
          { status: 409 },
        );
      }

      throw error;
    }
  }

  return json({ error: `Method ${method} not supported.` }, { status: 405 });
};
