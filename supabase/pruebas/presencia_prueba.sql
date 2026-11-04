-- ==========================================================
-- Prueba de supabase/presencia_privada.sql en un Postgres local (NO en Supabase).
-- Parte de restricciones_menores_prueba.sql (que incluye todas las anteriores).
-- ==========================================================
\i /sql/pruebas/restricciones_menores_prueba.sql

-- Imitación mínima de Realtime: la tabla de mensajes y el tema de la conexión
create schema if not exists realtime;
create table if not exists realtime.messages (id serial primary key, topic text, extension text);
create or replace function realtime.topic() returns text language sql stable as $$ select current_setting('prueba.tema', true) $$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on all sequences in schema realtime to authenticated;
insert into realtime.messages (topic, extension) values ('x', 'presence'), ('x', 'broadcast');

\i /sql/presencia_privada.sql
\i /sql/presencia_privada.sql
\echo 'presencia_privada.sql aplicado dos veces sin error'

-- Un empleado en la sucursal a; la sucursal c queda sin negocio
update public.sucursales set negocio_id = null where id = '00000000-0000-0000-0000-00000000000c';
insert into auth.users values ('00000000-0000-0000-0000-0000000000e9') on conflict do nothing;
insert into public.perfiles (id, sucursal_id, nombre, rol) values ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-00000000000a', 'Empleado A', 'empleado') on conflict do nothing;

-- ¿Puede esta persona leer y anunciarse en ese tema? (lo que Realtime comprueba al abrir el canal)
create or replace function pg_temp.puede(uid text, tema text, ext text default 'presence') returns boolean language plpgsql as $$
declare n int; ok boolean;
begin
  perform set_config('prueba.uid', uid, false);
  perform set_config('prueba.tema', tema, false);
  set local role authenticated;
  select count(*) into n from realtime.messages where extension = ext;
  begin insert into realtime.messages (topic, extension) values (tema, ext); ok := true;
  exception when others then ok := false; end;
  reset role;
  return n > 0 and ok;
end $$;

do $$ declare
  neg_a uuid := (select negocio_id from public.sucursales where id = '00000000-0000-0000-0000-00000000000a');
  neg_b uuid := (select negocio_id from public.sucursales where id = '00000000-0000-0000-0000-00000000000b');
  emp text := '00000000-0000-0000-0000-0000000000e9';      -- empleado de la sucursal a
  dueno1 text := '00000000-0000-0000-0000-0000000000d1';
  dueno2 text := '00000000-0000-0000-0000-0000000000d2';   -- dueño del negocio de b
  sudo text := '00000000-0000-0000-0000-0000000000a5';
begin
  assert neg_a is not null and neg_b is not null and neg_a <> neg_b, 'la prueba necesita dos negocios';
  assert pg_temp.puede(emp, 'presencia-' || neg_a), 'el empleado no entra al canal de su negocio';
  assert not pg_temp.puede(emp, 'presencia-' || neg_b), 'el empleado entró al canal de otro negocio';
  assert pg_temp.puede(dueno2, 'presencia-' || neg_b), 'el dueño no entra al canal de su negocio';
  assert not pg_temp.puede(dueno2, 'presencia-' || neg_a), 'el dueño entró al canal de otro negocio';
  assert pg_temp.puede(sudo, 'presencia-' || neg_a) and pg_temp.puede(sudo, 'presencia-' || neg_b), 'el sudo no entra a todos';
  assert not pg_temp.puede(emp, 'presencia-sin-negocio'), 'sigue existiendo un canal común';
  assert not pg_temp.puede(emp, 'presencia-no-es-uuid'), 'aceptó un tema inválido';
  assert not pg_temp.puede(emp, 'presencia-' || neg_a, 'broadcast'), 'aceptó un mensaje que no es de presencia';
  assert not pg_temp.puede(emp, 'sucursal-00000000-0000-0000-0000-00000000000a'), 'aceptó un tema ajeno a la presencia';
  assert not pg_temp.puede('', 'presencia-' || neg_a), 'entró alguien sin sesión';
  -- Sucursal sin negocio: solo quien trabaja en ella
  assert not pg_temp.puede(dueno2, 'presencia-suc-00000000-0000-0000-0000-00000000000c'), 'un dueño ajeno entró al canal de una sucursal sin negocio';
  assert not pg_temp.puede(emp, 'presencia-suc-00000000-0000-0000-0000-00000000000c'), 'un empleado de otra sucursal entró';
  assert pg_temp.puede(sudo, 'presencia-suc-00000000-0000-0000-0000-00000000000c'), 'el sudo no entra a una sucursal sin negocio';
end $$;
\echo 'PRESENCIA OK'
