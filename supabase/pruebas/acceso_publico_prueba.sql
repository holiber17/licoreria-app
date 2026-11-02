-- ==========================================================
-- Prueba de supabase/acceso_publico.sql en un Postgres local (NO en Supabase).
-- Uso (desde la raíz del repo, con Docker):
--   docker run -d --name licor-pg -e POSTGRES_PASSWORD=x postgres:15
--   docker cp supabase/. licor-pg:/sql
--   docker exec licor-pg psql -U postgres -v ON_ERROR_STOP=1 -f /sql/pruebas/acceso_publico_prueba.sql
-- Si algo falla, psql se detiene con el error. Al final imprime "TODO OK".
-- ==========================================================
\set QUIET on
drop schema if exists public cascade; drop schema if exists privado cascade; drop schema if exists auth cascade;
create schema public; create schema auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

-- Imitación mínima de Supabase: auth.uid() sale de una variable de sesión
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('prueba.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;

-- Tablas como en producción (solo las columnas que importan aquí)
create table public.sucursales (id uuid primary key default gen_random_uuid(), nombre text not null, ciudad text, direccion text, activa boolean default true, logo_url text, app_nombre text, datos_pago jsonb not null default '{}');
create table public.perfiles (id uuid primary key references auth.users(id), sucursal_id uuid references public.sucursales(id), nombre text, rol text default 'empleado');
create table public.pedidos (id uuid primary key default gen_random_uuid(), sucursal_id uuid not null references public.sucursales(id), usuario_id uuid, cliente_nombre text not null, estado text default 'abierto', tasa_bcv numeric default 0, nota text, created_at timestamptz default now(), cliente_id uuid);
create table public.pedido_items (id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos(id) on delete cascade, nombre text not null, tipo text not null, total integer default 1, consumido integer default 0, precio_usd numeric default 0, unidad text default 'und', menu_id uuid);
create table public.solicitudes (id uuid primary key default gen_random_uuid(), sucursal_id uuid not null references public.sucursales(id) on delete cascade, pedido_id uuid not null references public.pedidos(id) on delete cascade, tipo text not null check (tipo in ('mesonero','pagar')), metodo text check (metodo is null or char_length(metodo) <= 40), estado text not null default 'pendiente', created_at timestamptz not null default now(), atendida_at timestamptz, atendida_por uuid);
alter table public.sucursales enable row level security; alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security; alter table public.solicitudes enable row level security;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- privado.es_dueno() como en supabase/seguridad.sql
create schema privado;
create function privado.es_dueno() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'dueno') $$;
grant usage on schema privado to authenticated;

-- Las políticas públicas de hoy (las que la fase 2 quita) y las del personal
create policy "ver_pedido_publico" on public.pedidos for select using (true);
create policy "ver_items_publico" on public.pedido_items for select using (true);
create policy "sucursal publica" on public.sucursales for select to anon using (true);
create policy "cliente ve estado de avisos recientes" on public.solicitudes for select to anon using (created_at > now() - interval '12 hours');
create policy "personal" on public.pedido_items for all to authenticated using (true) with check (true);
create policy "personal" on public.pedidos for all to authenticated using (true) with check (true);

-- Datos: dos sucursales, un pedido en cada una
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1');
insert into public.sucursales (id, nombre, datos_pago) values
  ('00000000-0000-0000-0000-00000000000a', 'Centro', '{"zelle":{"correo":"a@x.com"}}'),
  ('00000000-0000-0000-0000-00000000000b', 'Otra', '{"zelle":{"correo":"b@x.com"}}');
insert into public.perfiles values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 'Pedro', 'empleado');
insert into public.pedidos (id, sucursal_id, cliente_nombre, nota) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Carlos', 'nota interna'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000b', 'Ana', null);
insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values
  ('00000000-0000-0000-0000-0000000000c1', 'Ron', 'suelto', 2, 2, 28);

-- ---------- FASE 1 ----------
\i /sql/acceso_publico.sql
\i /sql/acceso_publico.sql
\echo 'fase 1 aplicada dos veces sin error'

-- ---------- FASE 2 (las líneas comentadas del archivo) ----------
drop policy if exists "ver_pedido_publico" on public.pedidos;
drop policy if exists "ver_items_publico" on public.pedido_items;
drop policy if exists "cliente ve estado de avisos recientes" on public.solicitudes;
drop policy if exists "cliente crea solicitud" on public.solicitudes;
drop policy if exists "sucursal publica" on public.sucursales;

-- ---------- Como cliente sin sesión ----------
set role anon;
do $$
declare j jsonb; n int; ok boolean;
begin
  -- No puede listar nada
  select count(*) into n from public.pedidos;      assert n = 0, 'anon lista pedidos';
  select count(*) into n from public.pedido_items; assert n = 0, 'anon lista items';
  select count(*) into n from public.solicitudes;  assert n = 0, 'anon lista avisos';
  select count(*) into n from public.sucursales;   assert n = 0, 'anon lista sucursales';
  -- Pero sí ve SU pedido, sin la nota interna
  j := public.pedido_publico('00000000-0000-0000-0000-0000000000c1');
  assert j->>'cliente_nombre' = 'Carlos', 'pedido_publico no devuelve el pedido';
  assert jsonb_array_length(j->'pedido_items') = 1, 'faltan los items';
  assert not (j ? 'nota') and not (j ? 'usuario_id'), 'pedido_publico expone campos internos';
  assert public.pedido_publico('00000000-0000-0000-0000-0000000000ff') is null, 'id inexistente debería ser null';
  j := public.sucursal_publica('00000000-0000-0000-0000-00000000000a');
  assert j->'datos_pago'->'zelle'->>'correo' = 'a@x.com', 'sucursal_publica sin datos de pago';
  -- Avisos: crea uno; el segundo del mismo tipo se rechaza; la referencia se limpia
  perform public.crear_solicitud('00000000-0000-0000-0000-0000000000c1', 'pagar', 'Pago móvil', '48 213!');
  begin
    perform public.crear_solicitud('00000000-0000-0000-0000-0000000000c1', 'pagar', 'Pago móvil', null);
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'se permitió un segundo aviso pendiente';
  select count(*) into n from public.avisos_de_pedido('00000000-0000-0000-0000-0000000000c1'); assert n = 1, 'avisos_de_pedido';
  select count(*) into n from public.avisos_de_pedido('00000000-0000-0000-0000-0000000000c2'); assert n = 0, 'avisos de otro pedido';
  -- No puede insertar directamente en la tabla
  begin
    insert into public.solicitudes (sucursal_id, pedido_id, tipo) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000c2', 'pagar');
    ok := false;
  exception when others then ok := true; end;
  assert ok, 'anon insertó un aviso directamente';
end $$;
reset role;
do $$ begin
  assert (select referencia from public.solicitudes limit 1) = '48213', 'la referencia no se limpió';
end $$;

-- ---------- Como empleado ----------
set role authenticated;
set prueba.uid = '00000000-0000-0000-0000-0000000000e1';
do $$
declare ok boolean; n int;
begin
  -- Precio negativo: rechazado
  begin
    insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values ('00000000-0000-0000-0000-0000000000c1', 'Descuento', 'suelto', 1, 1, -20);
    ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'se aceptó un precio negativo';
  -- Bajar lo servido: permitido, pero queda registrado
  update public.pedido_items set consumido = 1 where nombre = 'Ron';
  delete from public.pedido_items where nombre = 'Ron';
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.pedido_ajustes; assert n = 2, 'ajustes registrados: ' || n;
  assert (select sum(monto_usd) from public.pedido_ajustes) = 56, 'monto de los ajustes';
  assert (select count(*) from public.pedido_ajustes where usuario_id = '00000000-0000-0000-0000-0000000000e1') = 2, 'falta quién lo hizo';
end $$;
-- Borrar un pedido entero (cascada) no falla por el registro de ajustes
insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values ('00000000-0000-0000-0000-0000000000c2', 'Polar', 'combo', 12, 3, 1.2);
delete from public.pedidos where id = '00000000-0000-0000-0000-0000000000c2';
\echo 'TODO OK'
