# DENNO B STUDIO LAUNCH

Complete source package for the ticket booking site.

## Event
- 6 December 2026
- 12 PM - 6 PM
- Nairobi Chokaa Stage
- Regular KES 500
- VIP KES 1,500
- VVIP KES 2,000
- Maximum 20 tickets per order

## Payment
PayHero channel: 13748. Keep PAYHERO_BASIC_AUTH server-side in Supabase Edge Function secrets. Never put the Basic Auth token in the frontend.

## Emails
EmailJS is server-side in `payhero-webhook`. Successful payment sends the ticket email; cancelled/failed payment sends the failed-payment email.

## Cancellation UI
Failed or cancelled payment opens a separate cancellation popup. Clicking Okay closes it and resets the booking form so the customer can start again.

## Run
```bash
npm install
npm run dev
```
