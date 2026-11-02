-- ==========================================================
-- Prueba de supabase/negocios.sql en un Postgres local (NO en Supabase).
-- Parte de turnos_prueba.sql (que incluye las anteriores).
-- Dos negocios: el dueño de uno no ve ni toca nada del otro; el sudo ve todo.
-- ==========================================================
\i /sql/pruebas/turnos_prueba.sql

-- Lo que la cadena de pruebas no tiene y producción sí
create table if not exists public.menu (id uuid primary key default gen_random_uuid(), sucursal_id uuid not null references public.sucursales(id), nombre text not null, activo boolean default true);
alter table public.menu enable row level security;
alter table public.caja enable row level security;   -- en producción ya la tiene
grant select, insert, update, delete on public.menu to authenticated;
-- Las políticas abiertas de prueba de acceso_publico_prueba.sql no existen en producción
drop policy if exists "personal" on public.pedidos;
drop policy if exists "personal" on public.pedido_items;

\i /sql/negocios.sql
\i /sql/negocios.sql
\echo 'negocios.sql aplicado dos veces sin error'

-- Sucursal a (Centro) quedó en "Negocio principal"; la b pasa a un segundo negocio
insert into public.negocios (id, nombre) values ('00000000-0000-0000-0000-0000000000f2', 'Otro negocio');
update public.sucursales set negocio_id = '00000000-0000-0000-0000-0000000000f2' where id = '00000000-0000-0000-0000-00000000000b';
insert into auth.users values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000a5'), ('00000000-0000-0000-0000-0000000000b9');
insert into public.perfiles (id, sucursal_id, nombre, rol) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', 'Dueño uno', 'dueno'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000b', 'Dueño dos', 'dueno'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000000b', 'Sudo', 'sudo'),
  ('00000000-0000-0000-0000-0000000000b9', null, 'Pendiente', 'empleado');
-- Un pedido y una venta en cada negocio
insert into public.pedidos (id, sucursal_id, cliente_nombre) values
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-00000000000a', 'Mesa del uno'),
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-00000000000b', 'Mesa del dos');
insert into public.caja (sucursal_id, total_usd) values ('00000000-0000-0000-0000-00000000000a', 10);
do $$ begin
  assert (select negocio_id from public.perfiles where nombre = 'Dueño dos') = '00000000-0000-0000-0000-0000000000f2', 'el dueño no quedó en el negocio de su sucursal';
end $$;

set role authenticated;

-- ---------- Dueño del negocio principal ----------
set prueba.uid = '00000000-0000-0000-0000-0000000000d1';
do $$ declare ok boolean; n int; nueva uuid; begin
  assert exists (select 1 from public.sucursales where id = '00000000-0000-0000-0000-00000000000a'), 'no ve su sucursal';
  assert not exists (select 1 from public.sucursales where id = '00000000-0000-0000-0000-00000000000b'), 've la sucursal de otro negocio';
  assert exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c7'), 'no ve su pedido';
  assert not exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c8'), 've un pedido de otro negocio';
  assert not exists (select 1 from public.negocios where id = '00000000-0000-0000-0000-0000000000f2'), 've el otro negocio';
  assert exists (select 1 from public.perfiles where nombre = 'Pedro'), 'no ve a su empleado';
  assert exists (select 1 from public.perfiles where nombre = 'Pendiente'), 'no ve a los pendientes';
  assert not exists (select 1 from public.perfiles where nombre = 'Dueño dos'), 've al dueño de otro negocio';
  assert not exists (select 1 from public.perfiles where rol = 'sudo'), 've al sudo';
  -- No modifica la sucursal de otro negocio (no la ve: 0 filas)
  update public.sucursales set nombre = 'x' where id = '00000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count; assert n = 0, 'modificó una sucursal de otro negocio';
  -- No manda a su empleado a otro negocio
  begin update public.perfiles set sucursal_id = '00000000-0000-0000-0000-00000000000b' where nombre = 'Pedro'; ok := false; exception when others then ok := true; end;
  assert ok, 'movió un empleado a otro negocio';
  -- No hace sudo a nadie
  begin update public.perfiles set rol = 'sudo' where nombre = 'Pedro'; ok := false; exception when others then ok := true; end;
  assert ok, 'un dueño hizo sudo a alguien';
  -- No se pasa a una sucursal de otro negocio
  begin update public.perfiles set sucursal_id = '00000000-0000-0000-0000-00000000000b' where id = auth.uid(); ok := false; exception when others then ok := true; end;
  assert ok, 'el dueño se cambió a otro negocio';
  -- Activa a un pendiente en su sucursal
  update public.perfiles set sucursal_id = '00000000-0000-0000-0000-00000000000a' where nombre = 'Pendiente';
  get diagnostics n = row_count; assert n = 1, 'no pudo activar a un pendiente';
  -- La sucursal que crea queda en su negocio
  insert into public.sucursales (nombre) values ('Nueva del uno') returning id into nueva;
  assert (select negocio_id from public.sucursales where id = nueva) = (select negocio_id from public.perfiles where id = auth.uid()), 'la sucursal nueva no quedó en su negocio';
end $$;

-- ---------- Dueño del otro negocio ----------
set prueba.uid = '00000000-0000-0000-0000-0000000000d2';
do $$ begin
  assert exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c8'), 'no ve su pedido';
  assert not exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c7'), 've un pedido del otro negocio';
  assert not exists (select 1 from public.caja where sucursal_id = '00000000-0000-0000-0000-00000000000a'), 've la caja del otro negocio';
  assert not exists (select 1 from public.perfiles where nombre = 'Pedro'), 've al empleado del otro negocio';
end $$;

-- ---------- Empleado ----------
set prueba.uid = '00000000-0000-0000-0000-0000000000e1';
do $$ declare n int; begin
  assert exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c7'), 'el empleado no ve su pedido';
  assert not exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c8'), 'el empleado ve otra sucursal';
  select count(*) into n from public.perfiles; assert n = 1, 'el empleado ve otros perfiles';
end $$;

-- ---------- Sudo ----------
set prueba.uid = '00000000-0000-0000-0000-0000000000a5';
do $$ declare n int; begin
  select count(*) into n from public.negocios; assert n = 2, 'el sudo no ve todos los negocios';
  assert exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c7')
     and exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c8'), 'el sudo no ve todo';
  -- Mueve una sucursal de negocio y cambia de sucursal él mismo
  update public.sucursales set negocio_id = '00000000-0000-0000-0000-0000000000f2' where nombre = 'Nueva del uno';
  get diagnostics n = row_count; assert n = 1, 'el sudo no movió la sucursal';
  update public.perfiles set sucursal_id = '00000000-0000-0000-0000-00000000000a' where id = auth.uid();
  assert (select rol from public.perfiles where id = auth.uid()) = 'sudo', 'el sudo perdió su rol';
end $$;
reset role;
\echo 'NEGOCIOS OK'
