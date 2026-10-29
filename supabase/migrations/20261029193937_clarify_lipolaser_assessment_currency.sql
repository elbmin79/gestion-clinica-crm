update public.clinic_services
set offers = jsonb_set(offers, '{0,currency}', '"MXN"'::jsonb, false),
    notes = 'Moneda aclarada por la clínica: MXN.',
    updated_at = now()
where code = 'lipo-assessment'
  and offers #>> '{0,kind}' = 'single'
  and (offers #>> '{0,amount}')::numeric = 500
  and offers #>> '{0,currency}' = 'UNRESOLVED';
