This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Sales exports and database backups

On the Sales page, choose a date and select **Download daily sales CSV** to save that day's orders and items. This is a report for the owner; it is not a complete database backup.

For a full backup of the POS database on the free Supabase plan, use the Supabase CLI. Install Docker Desktop, then log in and link this local project to the correct Supabase project. Run these commands from the project folder, replacing the placeholder with the project reference from the Supabase project URL:

```powershell
npx supabase login
npx supabase link --project-ref <your-project-ref>
New-Item -ItemType Directory -Force backups
npx supabase db dump --linked -f backups/schema.sql
npx supabase db dump --linked --data-only --use-copy -f backups/data.sql
```

The first file contains the database schema and functions; the second contains the table data. Keep both files together and store a copy somewhere outside this computer and outside the Supabase project. The `backups/` folder is excluded from Git because these files contain shop data. Repeat the dump regularly. Supabase documents `db dump` as the free-plan backup approach: https://supabase.com/docs/guides/platform/backups.

## Staff accounts and access

The POS now requires staff to sign in. Owners can view sales and manage menu items; cashiers can take orders. Public sign-up is not part of the POS flow. In Supabase, turn off public sign-ups, create each staff account in Authentication, then assign its role from the SQL Editor. Replace the email in this example with the owner's account email:

```sql
INSERT INTO public.staff_profiles (user_id, role)
SELECT id, 'owner' FROM auth.users WHERE email = 'owner@example.com'
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
```

Use `'cashier'` instead of `'owner'` for cashier accounts. Apply the migration to the intended Supabase project after confirming it is the correct project:

```powershell
npx supabase db push
```

The migration removes the temporary anonymous access policies. Until it is applied and at least one owner account is set up, the hosted POS will not be usable.

## Inventory

Owners can open **Inventory** from the POS navigation to add ingredients, set low-stock thresholds, and record restocks, waste, or stock-count adjustments with a reason. Use grams (`g`), milliliters (`ml`), or individual units (`each`). Add a recipe mapping for every menu item; each mapping is the amount of one ingredient used for one sold item. When staff mark an order completed, configured recipe quantities are deducted in the same database transaction and recorded in inventory history. Completion is blocked if a mapped ingredient does not have enough stock. Menu items without recipes are listed on the Inventory page and do not deduct stock until configured. No ingredient quantities or recipes are preloaded, so enter the shop's real data before relying on inventory totals.

## End-of-day reports

The owner Sales page shows order counts, cancelled orders, total sales, best sellers, and payment totals for orders with payment information. Checkout currently does not record payment methods or cash received; when any orders are unrecorded, expected cash is shown as unavailable. The daily CSV remains available, and the date-range export supports up to one year. The Inventory page has a date-range CSV with stock movements and a current on-hand snapshot. Both reports are owner-only and suitable for phone or desktop use.

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
