---
'@stripe/link-cli': patch
---

Format amounts in `spend-request list`, `ucp catalog search`, and UCP checkout summaries using each currency's symbol and minor-unit exponent. Zero- and three-decimal currencies (e.g. JPY, KWD) previously rendered 100x or 10x off with a hardcoded `$`.
