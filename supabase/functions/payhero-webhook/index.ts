import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
type AnyObj = Record<string, unknown>;
const s = (v: unknown) => v === null || v === undefined ? '' : String(v);
const isSuccess = (r: AnyObj) => s(r.Status).toLowerCase() === 'success' || Number(r.ResultCode) === 0;
const isFailure = (r: AnyObj) => ['failed','failure','cancelled','canceled','declined','reversed','expired'].includes(s(r.Status).toLowerCase()) || (r.ResultCode !== undefined && Number(r.ResultCode) !== 0);
async function sendEmail(templateId: string, params: AnyObj) {
  const key = Deno.env.get('EMAILJS_PUBLIC_KEY'); const service = Deno.env.get('EMAILJS_SERVICE_ID');
  if (!key || !service || !templateId) throw new Error('EmailJS environment is not configured');
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: service, template_id: templateId, user_id: key, template_params: params }) });
  const text = await response.text(); if (!response.ok) throw new Error(`EmailJS ${response.status}: ${text}`);
}
async function getTicketType(supabase: ReturnType<typeof createClient>, id: string) { const { data } = await supabase.from('ticket_types').select('name,price_kes').eq('id', id).single(); return data; }
async function sendOrderEmail(supabase: ReturnType<typeof createClient>, order: AnyObj, typeName: string, tickets: AnyObj[], success: boolean) {
  const email = s(order.customer_email); if (!email) return;
  const eventRes = await supabase.from('events').select('name,event_date,venue,start_time,end_time,support_phone').eq('id', s(order.event_id)).single();
  const event = eventRes.data || {};
  const params: AnyObj = { to_name: s(order.customer_name), to_email: email, event_name: s(event.name || 'DENNO B STUDIO LAUNCH'), event_date: s(event.event_date || '6 December 2026'), event_time: `${s(event.start_time || '12:00').slice(0,5)} – ${s(event.end_time || '18:00').slice(0,5)}`, venue: s(event.venue || 'Nairobi, Chokaa Stage'), ticket_type: typeName, quantity: Number(order.quantity), amount: `KES ${Number(order.amount_kes).toLocaleString('en-KE')}`, support_phone: s(event.support_phone || '0742197572') };
  if (success) {
    params.ticket_list_html = tickets.map(t => { const token = s(t.qr_token); const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(token)}`; return `<div style="padding:12px;border:1px solid #e8e3d9;margin:8px 0;text-align:center"><strong>${s(t.ticket_number)}</strong><br/><img src="${qr}" alt="Ticket QR code" width="160" height="160" style="display:block;margin:10px auto;background:#fff"/><span>Keep this QR code ready for entry.</span></div>`; }).join('');
    await sendEmail(Deno.env.get('EMAILJS_SUCCESS_TEMPLATE_ID') || 'template_3hdchqs', params);
    await supabase.from('orders').update({ ticket_email_sent_at: new Date().toISOString() }).eq('id', s(order.id));
  } else {
    await sendEmail(Deno.env.get('EMAILJS_FAILED_TEMPLATE_ID') || 'template_n6ckwju', params);
    await supabase.from('orders').update({ failed_email_sent_at: new Date().toISOString() }).eq('id', s(order.id));
  }
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed.' }, 405);
  const expectedSecret = Deno.env.get('PAYHERO_WEBHOOK_SECRET');
  if (expectedSecret && req.headers.get('x-webhook-secret') !== expectedSecret) return json({ success: false, error: 'Unauthorized webhook.' }, 401);
  let payload: AnyObj; try { payload = await req.json(); } catch { return json({ success: false, error: 'Invalid JSON.' }, 400); }
  const response = (payload.response && typeof payload.response === 'object' ? payload.response : payload) as AnyObj;
  const externalReference = s(response.ExternalReference || response.external_reference || payload.external_reference);
  const checkoutId = s(response.CheckoutRequestID || response.checkout_request_id || response.MerchantRequestID || response.reference);
  if (!externalReference) return json({ success: false, error: 'Missing external reference.' }, 400);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const eventKey = checkoutId || `${externalReference}:${s(response.ResultCode)}:${s(response.Status)}`;
  const { error: dedupeError } = await supabase.from('webhook_events').insert({ provider: 'payhero', event_key: eventKey, payload });
  const duplicateEvent = dedupeError?.code === '23505';
  if (dedupeError && !duplicateEvent) console.error('Webhook dedupe insert warning', dedupeError);
  const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('external_reference', externalReference).maybeSingle();
  if (orderError || !order) return json({ success: false, error: 'Order not found for external reference.' }, 404);
  const statusText = s(response.Status).toLowerCase();
  const receiptAmount = Number(response.Amount);
  if (Number.isFinite(receiptAmount) && receiptAmount > 0 && receiptAmount !== Number(order.amount_kes)) {
    console.error('Callback amount mismatch', { externalReference, expected: order.amount_kes, received: receiptAmount });
    return json({ success: false, error: 'Payment amount does not match order.' }, 400);
  }
  const providerReference = checkoutId || s(order.provider_reference) || null;
  const { data: type } = await getTicketType(supabase, s(order.ticket_type_id));
  if (isSuccess(response)) {
    if (order.status === 'paid') {
      const { data: paidTickets } = await supabase.from('tickets').select('ticket_number,qr_token,status,issued_at').eq('order_id', order.id).order('issued_at', { ascending: true });
      if (!order.ticket_email_sent_at && paidTickets?.length === Number(order.quantity)) { try { await sendOrderEmail(supabase, order, s(type?.name || 'Ticket'), paidTickets, true); } catch (e) { console.error('Retry ticket email failed', e); } }
      return json({ success: true, already_paid: true, duplicate: duplicateEvent });
    }
    const { error: updateOrderError } = await supabase.from('orders').update({ status: 'paid', provider_reference: providerReference, paid_at: new Date().toISOString() }).eq('id', order.id);
    if (updateOrderError) { console.error('Could not mark order paid', updateOrderError); return json({ success: false, error: 'Could not update order.' }, 500); }
    await supabase.from('payments').upsert({ order_id: order.id, provider: 'payhero', provider_reference: providerReference, amount_kes: Number(order.amount_kes), phone: s(response.Phone || order.customer_phone), status: 'paid', payment_method: 'mpesa', raw_response: payload, updated_at: new Date().toISOString() }, { onConflict: 'provider_reference' });
    const { data: existing } = await supabase.from('tickets').select('ticket_number,qr_token,status,issued_at').eq('order_id', order.id);
    const existingTickets = existing || [];
    const needed = Math.max(0, Number(order.quantity) - existingTickets.length);
    const newTickets: AnyObj[] = [];
    for (let i = 0; i < needed; i++) newTickets.push({ order_id: order.id, ticket_number: `DBS-${crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase()}`, qr_token: crypto.randomUUID(), status: 'valid' });
    if (newTickets.length) { const { data: inserted, error: ticketError } = await supabase.from('tickets').insert(newTickets).select('ticket_number,qr_token,status,issued_at'); if (ticketError) { console.error('Ticket insert failed', ticketError); return json({ success: false, error: 'Payment confirmed but ticket creation needs retry.' }, 500); } existingTickets.push(...(inserted || [])); await supabase.rpc('increment_ticket_sold_count', { p_ticket_type_id: order.ticket_type_id, p_increment: newTickets.length }); }
    if (!order.ticket_email_sent_at && (existingTickets.length === Number(order.quantity))) { try { await sendOrderEmail(supabase, order, s(type?.name || 'Ticket'), existingTickets, true); } catch (e) { console.error('Ticket email delivery failed; it can be retried on a duplicate callback', e); } }
    await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider', 'payhero').eq('event_key', eventKey);
    return json({ success: true, status: 'paid', tickets_created: newTickets.length });
  }
  if (isFailure(response) || statusText.includes('cancel')) {
    if (order.status !== 'paid') await supabase.from('orders').update({ status: statusText.includes('expir') ? 'expired' : (statusText.includes('cancel') ? 'cancelled' : 'failed'), provider_reference: providerReference }).eq('id', order.id);
    await supabase.from('payments').upsert({ order_id: order.id, provider: 'payhero', provider_reference: providerReference, amount_kes: Number(order.amount_kes), phone: s(response.Phone || order.customer_phone), status: 'failed', payment_method: 'mpesa', raw_response: payload, updated_at: new Date().toISOString() }, { onConflict: 'provider_reference' });
    if (order.status === 'paid') {
      const { data: tickets } = await supabase.from('tickets').select('id,status').eq('order_id', order.id).eq('status','valid');
      if (tickets?.length) { await supabase.from('tickets').update({ status: 'cancelled' }).in('id', tickets.map((t: AnyObj) => t.id)); await supabase.rpc('increment_ticket_sold_count', { p_ticket_type_id: order.ticket_type_id, p_increment: -tickets.length }); }
    }
    if (!order.failed_email_sent_at) { try { await sendOrderEmail(supabase, order, s(type?.name || 'Ticket'), [], false); } catch (e) { console.error('Failure email delivery failed', e); } }
    await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider', 'payhero').eq('event_key', eventKey);
    return json({ success: true, status: 'failed' });
  }
  await supabase.from('payments').upsert({ order_id: order.id, provider: 'payhero', provider_reference: providerReference, amount_kes: Number(order.amount_kes), phone: s(response.Phone || order.customer_phone), status: 'pending', payment_method: 'mpesa', raw_response: payload, updated_at: new Date().toISOString() }, { onConflict: 'provider_reference' });
  await supabase.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider', 'payhero').eq('event_key', eventKey);
  return json({ success: true, status: 'pending' });
});
