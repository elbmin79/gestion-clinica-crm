alter table public.branches
  add column phone text,
  add column hours text;

update public.branches
set name = 'Elixir Clinic'
where name = 'Sucursal principal'
  and clinic_id = (select id from public.clinics where name = 'Elixir Clinic' limit 1);

update public.branches
set address = 'Calz. Macristy de Hermosillo #916 Col. Republica Mexicana Planta Alta, Local -3, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a sábados de 9:00 am a 2:00 pm'
where name = 'Elixir Clinic';

update public.branches
set address = 'Calz. Macristy de Hermosillo #916 Col. Republica Mexicana Planta Alta, Local -3, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a viernes de 11:00 am a 7:00 pm y sábados de 9:00 am a 2:00 pm'
where name = 'Macristy - Elixir Clinic Spa';

update public.branches
set address = 'Calz. Macristy de Hermosillo #916 Col. Republica Mexicana Planta Alta, Local -3, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a sábados de 9:00 am a 7:00 pm'
where name = 'Macristy - Florezen';

update public.branches
set address = 'Avenida General Ignacio Zaragoza 1747 Col. Nueva 21100, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a viernes de 10:00 am a 6:00 pm y sábados de 9:00 am a 2:00 pm'
where name = 'Zaragoza - Elixir Clinic Spa';

update public.branches
set address = 'Avenida General Ignacio Zaragoza 1747 Col. Nueva 21100, Mexicali, Baja California',
    phone = '6863086854',
    hours = 'Lunes a sábados de 9:00 am a 7:00 pm'
where name = 'Zaragoza - Florezen';
