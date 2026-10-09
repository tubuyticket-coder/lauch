# DENNO B STUDIO LAUNCH — project source

React + TypeScript + Vite ticket booking frontend, using a white/ivory layout, Cormorant Garamond + Inter fonts, gold accents, M-Pesa status polling, QR ticket display, and SEO files.

## Run locally
1. Install Node.js LTS.
2. Run `npm install`.
3. Run `npm run dev`.
4. For a production build run `npm run build`.

## Payment integration
The frontend calls the existing Supabase Edge Functions:
- `POST https://hpgujfzzallqfhiufuhn.supabase.co/functions/v1/create-payment`
- `GET https://hpgujfzzallqfhiufuhn.supabase.co/functions/v1/payment-status?external_reference=...`

The live PayHero credentials, webhook, database logic, and email sending are server-side and are **not included in this frontend ZIP**. Keep private PayHero keys in Supabase Edge Function secrets; never put them in this repo. If you need the backend source too, export the existing Edge Functions from your Supabase project separately and add them under `supabase/functions/`.

## Domain SEO
- `public/sitemap.xml`
- `public/robots.txt`
- canonical domain: `https://dennohstudio.co.ke/`

## Event
DENNO B STUDIO LAUNCH · 6 December 2026 · 12 PM–6 PM · Nairobi Chokaa Stage.
Ticket tiers: Regular KES 500, VIP KES 1,500, VVIP KES 2,000. Quantity selector supports 1–20 tickets.

## Important
This archive is a complete runnable **frontend project**. It is a reconstructed export based on the deployed site's visible source and configuration, not a byte-for-byte export of the AppDeploy snapshot. Verify payment flow against the current Supabase functions before using it for production bookings.
