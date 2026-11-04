-- ==========================================================
-- Prueba de supabase/menu_publico.sql y menu_publico_cierre.sql en un
-- Postgres local (NO en Supabase). Parte de dinero_seguro_prueba.sql.
-- Sin sesión: el menú de otro negocio no se lista y los datos de pago solo
-- salen con el pedido abierto.
-- ==========================================================
\i /sql/pruebas/dinero_seguro_prueba.sql

-- Lo que producción tiene y la cadena no: columnas del menú y la política de cliente.sql
alter table public.menu
  add column if not exists tipo text default 'suelto', add column if not exists precio_usd numeric default 0,
  add column if not exists unidad text default 'und', add column if not exists categoria text,
  add column if not exists unidades_combo integer, add column if not exists imagen_url text;
drop policy if exists "menu publico" on public.menu;
create policy "menu publico" on public.menu for select to anon using (activo = true);
grant select on public.menu to anon;

update public.sucursales set datos_pago = '{"zelle":{"correo":"a@x.com"}}' where id = '00000000-0000-0000-0000-00000000000a';
update public.sucursales set datos_pago = '{"zelle":{"correo":"b@x.com"}}' where id = '00000000-0000-0000-0000-00000000000b';
insert into public.menu (id, sucursal_id, nombre, categoria, precio_usd, activo) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'Ron A', 'Licores', 10, true),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000000a', 'Agotado A', 'Licores', 5, false),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-00000000000b', 'Cerveza B', 'Cervezas', 2, true);
insert into public.pedidos (id, sucursal_id, cliente_nombre, estado) values
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-00000000000a', 'Abierto A', 'abierto'),
  ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-00000000000a', 'Cerrado A', 'cancelado');

\i /sql/menu_publico.sql
\i /sql/menu_publico.sql
\echo 'menu_publico.sql aplicado dos veces sin error'

-- ---------- Fase 1: compatible con la app vieja, y ya entrega lo nuevo ----------
set role anon;
do $$ declare j jsonb; n int; begin
  select count(*) into n from public.menu;
  assert n = 2, 'fase 1: la política vieja debe seguir dando los activos de todos (' || n || ')';
  j := public.menu_publico('00000000-0000-0000-0000-00000000000a');
  assert jsonb_array_length(j) = 1 and j->0->>'nombre' = 'Ron A', 'menu_publico no devolvió solo el activo de la sucursal';
  assert j->0 ? 'precio_usd' and j->0 ? 'imagen_url' and not (j->0 ? 'activo') and not (j->0 ? 'sucursal_id'), 'menu_publico con campos de más o de menos';
  assert public.menu_publico('00000000-0000-0000-0000-0000000000ff') = '[]'::jsonb, 'sucursal inexistente debe dar []';
  assert public.sucursal_publica('00000000-0000-0000-0000-00000000000a') ? 'datos_pago', 'fase 1 no debe quitar datos_pago aún (app vieja)';
  j := public.pedido_publico('00000000-0000-0000-0000-0000000000f5');
  assert j->'datos_pago'->'zelle'->>'correo' = 'a@x.com', 'pedido abierto sin datos de pago';
  assert j->'pedido_items' is not null and j ? 'tasa_actual', 'pedido_publico perdió campos';
  j := public.pedido_publico('00000000-0000-0000-0000-0000000000f6');
  assert j->'datos_pago' = 'null'::jsonb, 'pedido cerrado entregó datos de pago';
end $$;
reset role;

-- Una sucursal desactivada no publica su menú
update public.sucursales set activa = false where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin assert public.menu_publico('00000000-0000-0000-0000-00000000000b') = '[]'::jsonb, 'sucursal inactiva publicó menú'; end $$;
update public.sucursales set activa = true where id = '00000000-0000-0000-0000-00000000000b';

-- ---------- Fase 2 ----------
\i /sql/menu_publico_cierre.sql
\i /sql/menu_publico_cierre.sql
\echo 'menu_publico_cierre.sql aplicado dos veces sin error'

set role anon;
do $$ declare n int; j jsonb; begin
  select count(*) into n from public.menu;
  assert n = 0, 'sin sesión aún se puede listar el menú (' || n || ')';
  assert jsonb_array_length(public.menu_publico('00000000-0000-0000-0000-00000000000b')) = 1, 'menu_publico dejó de funcionar sin la política';
  j := public.sucursal_publica('00000000-0000-0000-0000-00000000000a');
  assert not (j ? 'datos_pago'), 'sucursal_publica sigue entregando datos de pago';
  assert j->>'nombre' is not null and j ? 'tasa_actual' and j ? 'logo_url', 'sucursal_publica perdió campos';
  assert public.pedido_publico('00000000-0000-0000-0000-0000000000f5')->'datos_pago'->'zelle'->>'correo' = 'a@x.com', 'pedido abierto perdió datos de pago tras el cierre';
end $$;
reset role;
\echo 'MENU PUBLICO OK'
