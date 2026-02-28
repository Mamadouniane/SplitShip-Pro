export type RecipientInput = {
  recipientKey: string;
  quantity: number;
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
