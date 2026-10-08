import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const phoneForPayHero = (value: string) => { let p = value.replace(/[\s()-]/g, ''); if (p.startsWith('+')) p = p.slice(1); if (p.startsWith('0')) p = `254${p.slice(1)}`; if (!/^254[17]\d{8}$/.test(p)) throw new Error('Enter a valid Kenyan M-Pesa phone number.'); return p; };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed.' }, 405);
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const PAYHERO_BASIC_AUTH = Deno.env.get('PAYHERO_BASIC_AUTH');
  const PAYHERO_CHANNEL_ID = Deno.env.get('PAYHERO_CHANNEL_ID') || '13748';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PAYHERO_BASIC_AUTH) return json({ success: false, error: 'Payment service is not configured. Please contact support.' }, 503);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ success: false, error: 'Invalid request body.' }, 400); }
  const ticketSlug = String(body.ticket_type || '');
  const quantity = Number(body.quantity);
  const customerName = String(body.customer_name || '').trim();
  const customerEmail = String(body.customer_email || '').trim().toLowerCase();
  let phone = '';
  try { phone = phoneForPayHero(String(body.customer_phone || '')); } catch (e) { return json({ success: false, error: e instanceof Error ? e.message : 'Invalid phone number.' }, 400); }
  if (!['regular','vip','vvip'].includes(ticketSlug) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || customerName.length < 2 || customerName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 254) return json({ success: false, error: 'Check your ticket, quantity, name, phone number and email, then try again.' }, 400);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  try {
    const { data: ticketType, error: ticketErr } = await supabase.from('ticket_types').select('id,slug,name,price_kes,event_id,capacity,sold_count').eq('slug', ticketSlug).single();
    if (ticketErr || !ticketType) return json({ success: false, error: 'The selected ticket is not available.' }, 404);
    if (ticketType.capacity !== null && ticketType.sold_count + quantity > ticketType.capacity) return json({ success: false, error: 'There are not enough tickets left for this quantity.' }, 409);
    const { data: event } = await supabase.from('events').select('name').eq('id', ticketType.event_id).single();
    const amount = Number(ticketType.price_kes) * quantity;
    const externalReference = `DBS-${crypto.randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}`;
    const { data: order, error: orderErr } = await supabase.from('orders').insert({ event_id: ticketType.event_id, ticket_type_id: ticketType.id, customer_name: customerName, customer_phone: phone, customer_email: customerEmail, amount_kes: amount, quantity, status: 'pending', provider: 'payhero', external_reference: externalReference }).select('id,external_reference').single();
    if (orderErr || !order) { console.error('Order insert failed', orderErr); return json({ success: false, error: 'We could not create your booking. Please try again.' }, 500); }
    const auth = PAYHERO_BASIC_AUTH.startsWith('Basic ') ? PAYHERO_BASIC_AUTH : `Basic ${PAYHERO_BASIC_AUTH}`;
    let gatewayResponse: Response;
    let gateway: Record<string, unknown>;
    try {
      gatewayResponse = await fetch('https://backend.payhero.co.ke/api/v2/payments', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, phone_number: phone, channel_id: Number(PAYHERO_CHANNEL_ID), provider: 'm-pesa', external_reference: externalReference, customer_name: customerName, callback_url: `${SUPABASE_URL}/functions/v1/payhero-webhook` }) });
      gateway = await gatewayResponse.json();
    } catch (e) { console.error('PayHero network error', e); await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id); return json({ success: false, error: 'We could not reach M-Pesa. Please try again.' }, 502); }
    if (!gatewayResponse.ok) { console.error('PayHero rejected request', gatewayResponse.status, gateway); await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id); await supabase.from('payments').insert({ order_id: order.id, provider: 'payhero', amount_kes: amount, phone, status: 'failed', raw_response: gateway }); return json({ success: false, error: String(gateway.message || gateway.error || 'Could not start the M-Pesa payment. Check your number and try again.') }, 502); }
    const nested = (gateway.response && typeof gateway.response === 'object' ? gateway.response : gateway) as Record<string, unknown>;
    const providerReference = String(nested.CheckoutRequestID || nested.checkout_request_id || nested.reference || nested.id || gateway.CheckoutRequestID || '') || null;
    await supabase.from('orders').update({ provider_reference: providerReference }).eq('id', order.id);
    const { error: paymentErr } = await supabase.from('payments').insert({ order_id: order.id, provider: 'payhero', provider_reference: providerReference, amount_kes: amount, phone, status: 'pending', payment_method: 'mpesa', raw_response: gateway });
    if (paymentErr) console.error('Payment row insert failed', paymentErr);
    console.log('STK request started', { externalReference, ticket: ticketType.slug, quantity, amount, event: event?.name });
    return json({ success: true, external_reference: externalReference, order_id: order.id, amount_kes: amount, quantity, message: 'M-Pesa prompt sent. Check your phone.' });
  } catch (e) { console.error('create-payment unexpected error', e); return json({ success: false, error: 'Could not start the M-Pesa payment. Please try again.' }, 500); }
});
