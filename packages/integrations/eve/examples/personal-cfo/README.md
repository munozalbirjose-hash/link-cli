# Personal CFO for Eve

A read-only Eve agent that reviews your cash, spending, and connected accounts
from Link financial data. Requires Node.js 24+ and pnpm.

It can read transactions, balances, and connected sources. It cannot create
spend requests, retrieve payment credentials, or move money. Shell, file, and
web tools are turned off, so transaction text cannot direct the agent to run
code or send your data elsewhere.

Auth wiring is illustrative and assumes a single local user. Use your own
authentication and session integration when building your application.

## Prerequisites

- Link OAuth credentials with `http://localhost:3000/api/auth/callback/link`
  registered as a redirect URI.
- A Stripe account registered for Financial Connections. Without it, Link
  grants only Link transactions; balances, external transactions, and source
  details are unavailable and the agent reports them as inaccessible.

## Run

From the repository root:

```sh
pnpm install
cd packages/integrations/eve/examples/personal-cfo
cp .env.example .env.local
```

Fill in `.env.local` with your OpenRouter API key, Link OAuth credentials, and
`BETTER_AUTH_SECRET` (generate once with `openssl rand -hex 32`).

```sh
pnpm dev
```

Ask “How did I do last month?” Open the authorization link in your browser,
approve read access to your accounts, and return to the terminal.

## How it works

- `agent/lib/auth.ts` requests `userinfo:read` and the `source` actions
  `read_link_transactions`, `read_external_transactions`, `read_balances`, and
  `read_source_details`. It does not request `payment_methods.agentic`.
- `agent/extensions/link/tools/` disables every Link tool except
  `list_transactions`, `list_balances`, and `list_sources`.
- `agent/extensions/link/skills/create-payment-credential/SKILL.md` replaces
  the extension's purchase procedure with a refusal.
- `agent/skills/monthly-review.md` is a step-by-step monthly review.
