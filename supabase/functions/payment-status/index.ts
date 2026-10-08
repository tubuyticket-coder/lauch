import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ success: false, error: 'Method not allowed.' }, 405);
  const ref = new URL(req.url).searchParams.get('external_reference') || '';
  if (!/^DBS-[A-Z0-9]{18}$/.test(ref)) return json({ success: false, error: 'A valid booking reference is required.' }, 400);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: order, error } = await supabase.from('orders').select('id,external_reference,customer_name,customer_phone,customer_email,amount_kes,quantity,status,created_at').eq('external_reference', ref).maybeSingle();
  if (error || !order) return json({ success: false, error: 'Booking not found.' }, 404);
  const { data: tickets } = await supabase.from('tickets').select('ticket_number,qr_token,status,issued_at').eq('order_id', order.id).order('issued_at', { ascending: true });
  return json({ success: true, status: order.status, order_id: order.id, external_reference: order.external_reference, amount_kes: order.amount_kes, quantity: order.quantity, customer_name: order.customer_name, customer_phone: order.customer_phone, customer_email: order.customer_email, tickets: tickets || [] });
});
