---
"@stripe/link-cli": minor
"@stripe/link-sdk": minor
---

Add saved shipping-address updates with typed, partial address inputs and optional
default status. Omitted fields remain unchanged and explicit empty strings request
clearing. The CLI exposes `shipping-address update` and guides users through an
explicit `write_address` scope upgrade without broadening default login scopes.
