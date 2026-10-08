# DENNO B STUDIO LAUNCH — complete ticket, payment and email integration

This is a fresh React + Vite frontend and Supabase Edge Functions source bundle for the DENNO B STUDIO LAUNCH ticket flow.

## Event configuration
- Event: DENNO B STUDIO LAUNCH
- Date: 6 December 2026
- Time: 12 PM–6 PM
- Venue: Nairobi, Chokaa Stage
- Regular: KES 500
- VIP: KES 1,500
- VVIP: KES 2,000
- Quantity: 1–20 tickets per order

## Payment and email flow
1. Frontend validates attendee name, Kenyan M-Pesa phone number, email, ticket tier and quantity.
2. `create-payment` creates a pending order in Supabase, calls PayHero's STK-push endpoint, and records the payment reference. PayHero credentials are server-side secrets only.
3. PayHero calls `payhero-webhook`. The webhook validates the order reference and amount, records webhook events, updates payment/order status, issues one unique QR token per ticket on success, and increments the sold count.
4. On success, EmailJS sends the ticket email using `template_3hdchqs`. On failure/cancellation/expiry, EmailJS sends a failure email using `template_n6ckwju`.
5. `payment-status` is polled by the browser so the customer sees confirmed tickets or a cancellation/failure popup. Tickets are never shown as paid until Supabase confirms `paid` and ticket rows exist.

## Important deployment steps

### 1. Supabase database
Run `supabase/migrations/202610080001_complete_payment_email.sql` in the SQL Editor after confirming your existing tables match the schema described below. The project is expected to have these tables:
- `events`: `id`, `name`, `event_date`, `venue`, `start_time`, `end_time`, `support_phone`
- `ticket_types`: `id`, `event_id`, `slug`, `name`, `price_kes`, `capacity`, `sold_count`
- `orders`: `id`, `event_id`, `ticket_type_id`, `customer_name`, `customer_phone`, `customer_email`, `amount_kes`, `quantity`, `status`, `provider`, `provider_reference`, `external_reference`, `created_at`, `paid_at`, `ticket_email_sent_at`, `failed_email_sent_at`
- `payments`: `id`, `order_id`, `provider`, `provider_reference`, `amount_kes`, `phone`, `status`, `payment_method`, `raw_response`, `updated_at`
- `tickets`: `id`, `order_id`, `ticket_number`, `qr_token`, `status`, `issued_at`
- `webhook_events`: `id`, `provider`, `event_key`, `payload`, `processed_at`, `created_at`

The database must have RLS enabled. Do not create public policies for orders, payments, tickets or webhook events. Only the Edge Functions use the service-role key.

### 2. Supabase Edge Function secrets
Set these in Supabase Dashboard → Edge Functions → Secrets. Do not put these values in frontend environment variables or commit them to Git:
- `PAYHERO_BASIC_AUTH`: your PayHero Basic Authorization value (either raw Base64 token or a value already prefixed with `Basic `)
- `PAYHERO_CHANNEL_ID=13748`
- `EMAILJS_PUBLIC_KEY=Fq33PgyzrtInVfZGd`
- `EMAILJS_SERVICE_ID=XbrQdsnhktkh24tRvzS-0`
- `EMAILJS_SUCCESS_TEMPLATE_ID=template_3hdchqs`
- `EMAILJS_FAILED_TEMPLATE_ID=template_n6ckwju`
- Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function environment in standard hosted projects; confirm both are present.
- Optional `PAYHERO_WEBHOOK_SECRET`: only set this if your PayHero callback configuration can send the matching `x-webhook-secret` header. Otherwise leave it unset.

### 3. Deploy Edge Functions
Using the Supabase CLI from this project root:

```bash
supabase functions deploy create-payment --no-verify-jwt
supabase functions deploy payment-status --no-verify-jwt
supabase functions deploy payhero-webhook --no-verify-jwt
```

If you use the Supabase Dashboard's Edge Function editor, create/deploy each function using its corresponding `index.ts`. Keep `verify_jwt` disabled only for these public checkout/status endpoints and provider webhook; validate request inputs and never expose service-role or PayHero secrets.

### 4. PayHero callback
Set PayHero's callback URL to:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/payhero-webhook`

The code handles the callback format where provider details are inside `payload.response`, including `ExternalReference`, `CheckoutRequestID`, `Amount`, `ResultCode`, `ResultDesc`, `Phone`, and `Status`.

**Confirm the precise request fields expected by your PayHero account before going live.** The implementation sends `amount`, `phone_number`, `channel_id`, `provider: "m-pesa"`, `external_reference`, `customer_name`, and `callback_url`. If your PayHero channel expects a different reference field or callback URL field, adapt the payload to your account's current API docs.

### 5. EmailJS templates
Both templates must be configured in EmailJS to deliver to the variable `to_email`.

**Success template (`template_3hdchqs`) variables:**
- `to_name`, `to_email`, `event_name`, `event_date`, `event_time`, `venue`, `ticket_type`, `quantity`, `amount`, `ticket_list_html`, `support_phone`
- In the HTML editor use triple braces for raw ticket markup: `{{{ticket_list_html}}}`. Use `{{to_name}}`, `{{event_name}}`, `{{event_date}}`, `{{event_time}}`, `{{venue}}`, `{{ticket_type}}`, `{{quantity}}`, `{{amount}}`, `{{support_phone}}`, and `{{to_email}}` elsewhere.

**Failure template (`template_n6ckwju`) variables:**
- `to_name`, `to_email`, `ticket_type`, `quantity`, `amount`, `event_name`, `event_date`, `event_time`, `venue`, `support_phone`

Email sending is server-side in the webhook, not in browser code. The webhook records the sent timestamp only after EmailJS succeeds. Check Edge Function logs and EmailJS activity when testing delivery.

## Local frontend

```bash
npm install
cp .env.example .env.local
# Set VITE_SUPABASE_URL to the real project URL
npm run dev
npm run build
```

Only `VITE_SUPABASE_URL` belongs in `.env.local`. Never prefix PayHero credentials, the service-role key, or EmailJS private credentials with `VITE_`.

## Production test checklist
1. Test each ticket tier with a small real test amount if PayHero provides a safe test channel.
2. Confirm an order and payment row are created with the same external reference.
3. Complete an M-Pesa prompt and verify `orders.status = paid`, payment status is `paid`, one ticket row per quantity exists, and sold count increases by quantity.
4. Confirm the success email arrives with ticket numbers and QR tokens.
5. Cancel/decline an M-Pesa prompt and verify the order is `cancelled` or `failed`, no ticket is issued, and the failure email arrives.
6. Replay a callback and verify no duplicate tickets are created.
7. Verify the QR codes scan to the opaque ticket token and your door-scanning system checks that token against `public.tickets` before allowing entry.

## Security and operational notes
- Rotate PayHero credentials that have been pasted into chats or source files. Do not commit secrets.
- EmailJS public keys are designed to be visible, but sending is deliberately done server-side here. Restrict EmailJS template settings and monitor quotas.
- The `qr_token` is a random token, not a payment credential. Your entry scanner should validate it server-side and mark the ticket `used` atomically.
- For high-volume sales, add a database transaction/RPC that atomically reserves capacity and creates the order to prevent concurrent overselling.
- Verify your PayHero channel's exact API field names and callback security options before production traffic.
