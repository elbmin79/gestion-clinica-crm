alter table public.appointments
  add column session_price_amount numeric,
  add column session_price_currency text,
  add constraint appointments_session_price_valid check (
    (session_price_amount is null and session_price_currency is null)
    or (
      session_price_amount is not null
      and session_price_currency is not null
      and session_price_currency in ('MXN', 'USD')
      and session_price_amount between 0 and 9999999999.99
      and session_price_amount = round(session_price_amount, 2)
    )
  );
