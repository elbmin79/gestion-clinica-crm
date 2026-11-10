-- Canonical USD to MXN reference rates recorded from Frankfurter by the server.
-- A published correction can coexist with the previous value used in receipts.
create table public.payment_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null check (isfinite(rate_date)),
  rate numeric not null check (rate > 0 and rate < 100000 and rate = round(rate, 12)),
  unique (rate_date, rate)
);
alter table public.payment_exchange_rates enable row level security;
revoke all on public.payment_exchange_rates from public, anon, authenticated, service_role;
grant select on public.payment_exchange_rates to authenticated, service_role;
grant insert (rate_date, rate) on public.payment_exchange_rates to service_role;
create policy payment_exchange_rates_read on public.payment_exchange_rates for select to authenticated using (true);

alter table public.payments
  add column original_amount_usd numeric,
  add column fx_rate_id uuid references public.payment_exchange_rates(id) on delete restrict,
  add constraint payments_exchange_pair check (
    (original_amount_usd is null and fx_rate_id is null)
    or (original_amount_usd is not null and fx_rate_id is not null
      and original_amount_usd > 0 and original_amount_usd <= 9999999999.99
      and original_amount_usd = round(original_amount_usd, 2))
  );
create index payments_fx_rate_idx on public.payments(fx_rate_id) where fx_rate_id is not null;

create function private.guard_payment_exchange_rate() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare reference public.payment_exchange_rates%rowtype;
begin
  if new.fx_rate_id is null or new.original_amount_usd is null then return new; end if;
  select * into reference from public.payment_exchange_rates r where r.id = new.fx_rate_id;
  if not found or reference.rate_date > new.transaction_date or round(new.original_amount_usd * reference.rate, 2) <> new.amount then
    raise exception 'The MXN amount must match the stored exchange rate'
      using errcode = '23514', constraint = 'payments_exchange_amount';
  end if;
  return new;
end $$;
revoke all on function private.guard_payment_exchange_rate() from public, anon, authenticated;
create trigger payments_currency_snapshot_guard before insert on public.payments
  for each row execute function private.guard_payment_exchange_rate();
