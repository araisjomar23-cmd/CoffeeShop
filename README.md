This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Sales exports and database backups

On the Sales page, choose a date or date range and download the sales PDF. It includes an order-sales overview, payment activity, top items, and order details. This is a report for the owner; it is not a complete database backup.

For a full backup of the POS database on the free Supabase plan, use the Supabase CLI. Install Docker Desktop, then log in and link this local project to the correct Supabase project. Run these commands from the project folder, replacing the placeholder with the project reference from the Supabase project URL:

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
New-Item -ItemType Directory -Force backups
npx supabase db dump --linked -f backups/schema.sql
npx supabase db dump --linked --data-only --use-copy -f backups/data.sql
```

The first file contains the database schema and functions; the second contains the table data. Keep both files together and store a copy somewhere outside this computer and outside the Supabase project. The `backups/` folder is excluded from Git because these files contain shop data. Repeat the dump regularly. Supabase documents `db dump` as the free-plan backup approach: https://supabase.com/docs/guides/platform/backups.

## Owner-only operation

This POS is for one owner. Sign in using an account assigned the owner role in staff_profiles. Cashier accounts cannot access the application. Disable public signups in the hosted Supabase Authentication settings as well as the local configuration.

## Deploying the reliability update

Apply [the migration](supabase/migrations/20261027090000_owner_mobile_reliability.sql) to the intended Supabase project before deploying this application version. It adds order revisions and payment events, changes the edit/cancel RPC signatures, enforces owner access, and retires inventory. Deploy during a quiet period and reload open tabs afterwards; the previous application version uses the old RPC signatures.

Inventory screens, actions, exports and automatic deductions have been removed. Historical ingredient, recipe and movement tables remain intact but are no longer accessible through the application. Old inventory bookmarks redirect to New order; old export requests return HTTP 410.

## Daily use on a phone

1. Choose items and tap **Review order** in the bottom bar.
2. Check the ticket and choose Cash or GCash. Verify that payment was actually received, then tap **Payment received - Save**. GCash is manually confirmed, not integrated with a payment provider.
3. Open **Orders** to mark ready/completed. Unfinished orders remain visible after midnight. Refresh now is available alongside automatic updates.
4. When editing the amount, collect or return the displayed difference using the same payment method and confirm it before saving. Cancelling a paid order requires refund confirmation. The app records your confirmation; it does not transfer money.
5. Open **Sales** for order sales and money received/returned. Order sales follow the original order date; payment events follow the date the money movement was recorded. Payment-event tracking begins with this update and does not reconstruct historical collections. Older order sales remain available.

On a connection failure, keep the ticket tab open and retry the unchanged order, or check Orders before editing it. This is not an offline payment system. Use a paper record during a prolonged outage and reconcile it once connected. Do not collect or refund money twice when retrying an interrupted save.

## Verification

Run npm test, npm run lint, and npx tsc --noEmit. The disposable PostgreSQL integration check is scripts/check-database.mjs. Install @electric-sql/pglite in a temporary directory, set POS_TEST_PGLITE to that package's absolute directory, then run node scripts/check-database.mjs. It applies every migration in memory and checks cash editing, revision conflicts, settlement confirmation, inventory retirement, refunds and access restrictions. It never uses live Supabase credentials.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
