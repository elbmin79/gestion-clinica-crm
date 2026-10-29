-- Explicitly requested fictional agenda examples for 29 October 2026.
-- No real patient names from the reference image, contact details, payments, or message authorization.
-- Re-running this batch does not duplicate records. Existing clinic data is not replaced.
do $demo$
declare
  target_clinic uuid;
  clinic_timezone text;
  sample record;
  target_provider uuid;
  target_branch uuid;
  target_business uuid;
  target_patient uuid;
  seed_day date := date '2026-10-29';
  record_key text;
  sample_start timestamptz;
  marker text := 'DEMO-AGENDA-20261029';
begin
  if (select count(*) from public.clinics where name='Elixir Clinic') <> 1 then
    raise exception 'The demo requires exactly one Elixir Clinic; select the intended clinic explicitly.';
  end if;
  select id,timezone into target_clinic,clinic_timezone from public.clinics where name='Elixir Clinic';
  for sample in select * from (values
      (1, 'Camila Robles Mendoza', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '09:00', 30, 'Revisión de tratamiento'),
      (2, 'Mariana Paredes Luna', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '09:30', 90, 'Morpheus facial'),
      (3, 'Paola Castañeda Ruiz', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '11:00', 15, 'Revisión de Morpheus'),
      (4, 'Luciana Beltrán Soto', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '11:15', 45, 'NCTF facial'),
      (5, 'Daniela Ochoa Ríos', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '12:00', 30, 'Revisión de seguimiento'),
      (6, 'Valeria Serrano Díaz', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '12:30', 60, 'Morpheus cuello'),
      (7, 'Andrea Montoya Vega', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '13:30', 15, 'Revisión de NCTF'),
      (8, 'Fernanda Cárdenas León', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '13:45', 45, 'NCTF rostro'),
      (9, 'Renata Escobedo Lara', 'Iliana Verdugo Fernandez', 'Macristy - Elixir Clinic Spa', '14:30', 30, 'Revisión de resultados'),
      (10, 'Sofía Aguirre Salas', 'Edith', 'Macristy - Florezen', '09:00', 60, 'Limpieza facial'),
      (11, 'Regina Navarro Gil', 'Edith', 'Macristy - Florezen', '10:00', 45, 'Hidratación facial'),
      (12, 'Ximena Valdés Peña', 'Edith', 'Macristy - Florezen', '10:45', 15, 'Revisión de piel'),
      (13, 'Catalina Lozano Cruz', 'Edith', 'Macristy - Florezen', '11:00', 90, 'Facial profundo'),
      (14, 'Mónica Treviño Solís', 'Edith', 'Macristy - Florezen', '12:30', 45, 'Facial hidratante'),
      (15, 'Gabriela Villarreal Paz', 'Edith', 'Macristy - Florezen', '13:15', 30, 'Consulta de valoración'),
      (16, 'Alejandra Rosales Ibarra', 'Edith', 'Macristy - Florezen', '13:45', 75, 'Tratamiento facial'),
      (17, 'Natalia Armenta Flores', 'Gladys', 'Macristy - Florezen', '09:00', 30, 'Consulta de valoración'),
      (18, 'Claudia Saucedo Rangel', 'Gladys', 'Macristy - Florezen', '09:30', 60, 'Facial relajante'),
      (19, 'Isabel Quiroz Medina', 'Gladys', 'Macristy - Florezen', '10:30', 45, 'Limpieza facial'),
      (20, 'Verónica Carrillo Santos', 'Gladys', 'Macristy - Florezen', '11:15', 45, 'Seguimiento facial'),
      (21, 'Patricia Salcedo Núñez', 'Gladys', 'Macristy - Elixir Clinic Spa', '13:00', 60, 'Facial hidratante'),
      (22, 'Beatriz Figueroa Vidal', 'Gladys', 'Macristy - Elixir Clinic Spa', '14:00', 30, 'Consulta de valoración'),
      (23, 'Lorena Duarte Acosta', 'Gladys', 'Macristy - Elixir Clinic Spa', '14:30', 30, 'Limpieza facial'),
      (24, 'Adriana Cortez Molina', 'Anaily', 'Zaragoza - Florezen', '09:00', 90, 'Tratamiento corporal'),
      (25, 'Marcela Espinoza Vega', 'Anaily', 'Zaragoza - Florezen', '10:30', 30, 'Consulta de valoración'),
      (26, 'Teresa Zamora Castillo', 'Anaily', 'Zaragoza - Florezen', '11:00', 45, 'Tratamiento facial'),
      (27, 'Laura Cervantes Meza', 'Anaily', 'Zaragoza - Florezen', '11:45', 15, 'Revisión de seguimiento'),
      (28, 'Elena Sandoval Campos', 'Anaily', 'Zaragoza - Florezen', '12:00', 120, 'Sesión corporal completa'),
      (29, 'Rocío Velasco Juárez', 'Anaily', 'Zaragoza - Florezen', '14:00', 60, 'Limpieza facial'),
      (30, 'Ana Lucía Galván Torres', 'Diana', 'Zaragoza - Florezen', '09:00', 45, 'Facial hidratante'),
      (31, 'Silvia Benítez Ortega', 'Diana', 'Zaragoza - Florezen', '09:45', 15, 'Revisión facial'),
      (32, 'Julieta Alvarado Silva', 'Diana', 'Zaragoza - Florezen', '10:00', 60, 'Limpieza facial profunda'),
      (33, 'Cecilia Estrada Fuentes', 'Diana', 'Zaragoza - Florezen', '11:00', 30, 'Consulta de valoración'),
      (34, 'Inés Márquez Salazar', 'Diana', 'Zaragoza - Elixir Clinic Spa', '12:30', 45, 'Facial revitalizante'),
      (35, 'Angélica Palacios Nieto', 'Diana', 'Zaragoza - Elixir Clinic Spa', '13:15', 45, 'Seguimiento facial'),
      (36, 'Estela Romero Ayala', 'Diana', 'Zaragoza - Elixir Clinic Spa', '14:00', 60, 'Tratamiento facial')
  ) as examples(n,patient_name,provider_name,branch_name,start_time,duration_minutes,service_name)
  loop
    if (select count(*) from public.clinic_providers where clinic_id=target_clinic and name=sample.provider_name and active) <> 1 then
      raise exception 'Missing or ambiguous demo professional: %', sample.provider_name;
    end if;
    select id into target_provider from public.clinic_providers where clinic_id=target_clinic and name=sample.provider_name and active;
    if (select count(*) from public.branches where clinic_id=target_clinic and name=sample.branch_name and active) <> 1 then
      raise exception 'Missing or ambiguous demo branch: %', sample.branch_name;
    end if;
    select id,business_id into target_branch,target_business from public.branches where clinic_id=target_clinic and name=sample.branch_name and active;
    if not exists(select 1 from public.provider_branches where clinic_id=target_clinic and provider_id=target_provider and branch_id=target_branch) then
      raise exception 'Professional is not assigned to the demo branch: %', sample.provider_name;
    end if;
    record_key := marker || '-' || lpad(sample.n::text,3,'0');
    insert into public.patients(clinic_id,record_number,full_name,service_summary,status,primary_branch_id,primary_provider_id,appointment_whatsapp_opt_in)
      values(target_clinic,record_key,sample.patient_name,'DEMO — paciente ficticio. ' || sample.service_name,'active',target_branch,target_provider,false)
      on conflict(clinic_id,record_number) do nothing;
    select id into target_patient from public.patients where clinic_id=target_clinic and record_number=record_key;
    sample_start := (seed_day + sample.start_time::time) at time zone clinic_timezone;
    if not exists(select 1 from public.appointments where clinic_id=target_clinic and patient_id=target_patient and note like marker || '%') then
      insert into public.appointments(clinic_id,patient_id,business_id,branch_id,provider_id,starts_at,ends_at,service,modality,status,deposit_required,deposit_amount,note)
        values(target_clinic,target_patient,target_business,target_branch,target_provider,sample_start,
          sample_start + make_interval(mins=>sample.duration_minutes),sample.service_name || ' · Demo','in_person','pending',true,500,
          marker || ' | DATOS FICTICIOS: ejemplo solicitado de agenda. Anticipo ilustrativo de $500, sin pago registrado. Sin teléfono, correo ni autorización de WhatsApp.');
    end if;
  end loop;
  -- Keep illustrative bookings out of the outgoing confirmation queue.
  update public.appointment_confirmation_requests set status='cancelled',updated_at=now()
    where clinic_id=target_clinic and status in ('pending','failed') and appointment_id in
      (select id from public.appointments where clinic_id=target_clinic and note like marker || '%');
end;
$demo$;
