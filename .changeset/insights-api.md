---
'@stripe/link-sdk': minor
'@stripe/link-cli': minor
---

[beta] Add the Insights API. The SDK adds `insights.listAvailableTypes()` and `insights.list()`, and the CLI adds `insights list-available-types` and `insights list`. Results report `ready`, `pending`, or `no_data` status, missing-permission remediation, and tagged values. These require the Link API release that serves `/insights`.
