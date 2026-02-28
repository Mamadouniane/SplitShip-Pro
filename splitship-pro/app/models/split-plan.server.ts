export type RecipientInput = {
  recipientKey: string;
  quantity: number;
};

export type FulfillmentInstruction = {
  recipientId: string;
  recipientName: string;
  quantity: number;
  address: {
    line1: string;
    line2?: string | null;
    city: string;
    province?: string | null;
    postalCode: string;
    countryCode: string;
  };
};

export type AllocationValidationResult = {
  valid: boolean;
  expectedQuantity: number;
  allocatedQuantity: number;
  errors: string[];
};

/**
 * Enforce SplitShip Pro core rule:
 * sum(recipient quantities) === line item quantity
 */
export function validateRecipientAllocations(
  lineItemQuantity: number,
  allocations: RecipientInput[],
): AllocationValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(lineItemQuantity) || lineItemQuantity <= 0) {
    errors.push("Line item quantity must be a positive integer.");
  }

  if (!allocations.length) {
    errors.push("At least one recipient allocation is required.");
  }

  const allocatedQuantity = allocations.reduce((sum, allocation) => {
    if (!allocation.recipientKey?.trim()) {
      errors.push("Each allocation must include a recipient key.");
    }

    if (!Number.isInteger(allocation.quantity) || allocation.quantity <= 0) {
      errors.push("Each recipient quantity must be a positive integer.");
    }

    return sum + allocation.quantity;
  }, 0);

  if (lineItemQuantity !== allocatedQuantity) {
    errors.push(
      `Allocated quantity (${allocatedQuantity}) must equal line item quantity (${lineItemQuantity}).`,
    );
  }

  return {
    valid: errors.length === 0,
    expectedQuantity: lineItemQuantity,
    allocatedQuantity,
    errors,
  };
}

export function buildFulfillmentInstructions(
  allocations: Array<{
    quantity: number;
    recipient: {
      id: string;
      name: string;
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      province?: string | null;
      postalCode: string;
      countryCode: string;
    };
  }>,
): FulfillmentInstruction[] {
  return allocations.map((allocation) => ({
    recipientId: allocation.recipient.id,
    recipientName: allocation.recipient.name,
    quantity: allocation.quantity,
    address: {
      line1: allocation.recipient.addressLine1,
      line2: allocation.recipient.addressLine2,
      city: allocation.recipient.city,
      province: allocation.recipient.province,
      postalCode: allocation.recipient.postalCode,
      countryCode: allocation.recipient.countryCode,
    },
  }));
}
