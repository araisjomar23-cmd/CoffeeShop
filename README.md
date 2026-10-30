# MariTea's POS

An owner-operated point-of-sale system for taking orders, managing the kitchen queue, and reviewing sales.

## Run locally

Install dependencies and set these variables in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then run:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the owner account configured in Supabase.

## Main screens

- **Dashboard** (`/dashboard`): daily, weekly, monthly, or custom-range sales overview.
- **New order** (`/`): create an order and record its payment method.
- **Orders** (`/kitchen`): track orders through preparation and completion.
- **Sales** (`/summary`): review orders, payment activity, and download PDF reports.
- **Health** (`/health`): check whether the Supabase Auth endpoint is reachable.

## Database and backups

Database schema changes are recorded in `supabase/migrations/`. Verify the linked project before applying pending migrations:

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase migration list --linked
npx supabase db push --linked
```

Before production changes, back up the Supabase database. On the free Supabase plan, use the Supabase CLI:

```powershell
New-Item -ItemType Directory -Force backups
npx supabase db dump --linked -f backups/schema.sql
npx supabase db dump --linked --data-only --use-copy -f backups/data.sql
```

Keep backups outside the repository and the Supabase project. The `backups/` directory is git-ignored because dumps contain shop data.

## Sales data notes

Order sales use each order's original order date and exclude cancelled orders. Payment collections and refunds use the date each payment event was recorded. Historical orders without a recorded payment method cannot be assigned to cash or GCash; legacy cancelled orders may not have verifiable refund history.

Inventory has been retired from the application. Historical inventory tables and their migrations remain in the database history; old inventory bookmarks redirect to New order and old export requests return HTTP 410.

## Checks

```powershell
npm test
npm run lint
npx tsc --noEmit
```

The optional disposable PostgreSQL migration check is `scripts/check-database.mjs`. It runs only when `POS_TEST_PGLITE` points to a temporary `@electric-sql/pglite` installation and does not use live credentials.
