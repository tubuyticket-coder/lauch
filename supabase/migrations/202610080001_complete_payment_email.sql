-- DENNO B STUDIO LAUNCH: payment/email integration prerequisites.
-- Run this against the existing DENNO B Supabase project. It is safe to re-run.

alter table public.orders add column if not exists quantity integer not null default 1;
alter table public.orders add column if not exists ticket_email_sent_at timestamptz;
alter table public.orders add column if not exists failed_email_sent_at timestamptz;
alter table public.orders add column if not exists provider_reference text;
alter table public.orders add column if not exists external_reference text;

alter table public.orders drop constraint if exists orders_quantity_check;
alter table public.orders add constraint orders_quantity_check check (quantity between 1 and 20);

create unique index if not exists orders_external_reference_uidx on public.orders(external_reference) where external_reference is not null;
create unique index if not exists orders_provider_reference_uidx on public.orders(provider_reference) where provider_reference is not null;
create unique index if not exists payments_provider_reference_uidx on public.payments(provider_reference) where provider_reference is not null;
create unique index if not exists tickets_ticket_number_uidx on public.tickets(ticket_number);
create unique index if not exists tickets_qr_token_uidx on public.tickets(qr_token);
create unique index if not exists webhook_events_provider_event_key_uidx on public.webhook_events(provider, event_key);

alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists raw_response jsonb;
alter table public.payments add column if not exists updated_at timestamptz default now();

create or replace function public.increment_ticket_sold_count(p_ticket_type_id uuid, p_increment integer default 1)
returns void language sql security invoker set search_path=public as $$
  update public.ticket_types set sold_count = greatest(0, sold_count + p_increment) where id = p_ticket_type_id;
$$;
revoke all on function public.increment_ticket_sold_count(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_ticket_sold_count(uuid, integer) to service_role;

alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.tickets enable row level security;
alter table public.webhook_events enable row level security;
-- No anon/authenticated policies are created for orders, payments, tickets, or webhook events.
