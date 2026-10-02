---
'@stripe/link-sdk': minor
'@stripe/link-cli': patch
---

Add optional server-formatted amount fields: `SpendRequest.formatted_amount`, UCP checkout `formatted_amount_total` / `formatted_amount_subtotal`, and UCP catalog `formatted_price` / `formatted_sale_price` / `price.formatted_amount`. Interactive spend-request and UCP output now displays these strings and falls back to the raw minor-unit amount and currency code (e.g. `1000 JPY`) instead of a hardcoded `$` and `/100`, which rendered zero- and three-decimal currencies 100x or 10x off. The UCP checkout summary now reads `amount_fulfillment` and line-item `amount_subtotal`, matching the API.
