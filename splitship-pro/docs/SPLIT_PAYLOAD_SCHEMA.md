# SplitShip Pro 3PL Payload Contract

Schema version: `2026-03-3pl-v1`

## Purpose
This payload is emitted per split plan for 3PL consumption while preserving a single Shopify order.

## Contract

```json
{
  "schemaVersion": "2026-03-3pl-v1",
  "idempotencyKey": "shop:splitPlanId:attempt",
  "splitPlanId": "cuid",
  "shop": "splitship-pro.myshopify.com",
  "orderId": "gid://shopify/Order/...",
  "cartToken": "optional-cart-token",
  "sourceLineGid": "gid://shopify/LineItem/...",
  "lineQuantity": 4,
  "recipients": [
    {
      "recipientId": "cuid",
      "recipientName": "Jane Doe",
      "quantity": 2,
      "address": {
        "line1": "123 Main St",
        "line2": null,
        "city": "Chicago",
        "province": "IL",
        "postalCode": "60601",
        "countryCode": "US"
      }
    }
  ]
}
```

## Delivery states
- `pending`
- `sent`
- `acked`
- `failed`
- `retried` (represented by event + attempts increment)

## Idempotency
`idempotencyKey` must be stable per send attempt and used by downstream middleware/3PL to dedupe duplicates.

## Notes
In current dev mode, send is a placeholder logger in `app/api/split-ops`. Replace with real 3PL endpoint integration when available.
