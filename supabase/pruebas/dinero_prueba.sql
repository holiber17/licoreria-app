-- ==========================================================
-- Prueba de supabase/dinero.sql en un Postgres local (NO en Supabase).
-- Uso (desde la raíz del repo, con Docker; en Git Bash anteponer MSYS_NO_PATHCONV=1):
--   docker run -d --name licor-pg -e POSTGRES_PASSWORD=x postgres:15
--   docker cp supabase/. licor-pg:/sql
--   docker exec licor-pg psql -U postgres -v ON_ERROR_STOP=1 -f /sql/pruebas/dinero_prueba.sql
-- Parte de la base de acceso_publico_prueba.sql y le agrega lo que usa el cobro.
-- ==========================================================
\i /sql/pruebas/acceso_publico_prueba.sql

create table public.tasas_bcv (id uuid primary key default gen_random_uuid(), sucursal_id uuid references public.sucursales(id), tasa numeric not null, fecha date not null default current_date, unique (sucursal_id, fecha));
create table public.caja (id uuid primary key default gen_random_uuid(), sucursal_id uuid not null, pedido_id uuid, usuario_id uuid, cliente_nombre text, cliente_id uuid, total_usd numeric, tasa_bcv numeric, nota text, metodo_pago text, fecha timestamptz);
create table public.inventario (id uuid primary key default gen_random_uuid(), sucursal_id uuid not null, menu_id uuid, nombre text not null, stock_actual numeric default 0, updated_at timestamptz, created_at timestamptz default now());
create table public.inventario_movimientos (id uuid primary key default gen_random_uuid(), inventario_id uuid, sucursal_id uuid, usuario_id uuid, tipo text, cantidad numeric, motivo text);
grant select, insert, update, delete on all tables in schema public to authenticated;

\i /sql/dinero.sql
\i /sql/dinero.sql
\echo 'dinero.sql aplicado dos veces sin error'

-- Pedido nuevo con un combo (4 de 12 servidos) y un suelto
insert into public.pedidos (id, sucursal_id, cliente_nombre, tasa_bcv) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', 'Mesa 9', 180);
insert into public.pedido_items (id, pedido_id, nombre, tipo, total, consumido, precio_usd) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'Polar', 'combo', 12, 4, 1.2),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d1', 'Hielo', 'suelto', 1, 1, 1);

set role authenticated;
set prueba.uid = '00000000-0000-0000-0000-0000000000e1';
do $$
declare v public.pedido_items; ok boolean; j json;
begin
  -- Dos "+" seguidos suman, no pisan
  perform public.servir('00000000-0000-0000-0000-0000000000f1', 1);
  v := public.servir('00000000-0000-0000-0000-0000000000f1', 1);
  assert v.consumido = 6, 'servir combo: ' || v.consumido;
  -- El suelto: lo pedido sigue a lo servido
  v := public.servir('00000000-0000-0000-0000-0000000000f2', 2);
  assert v.consumido = 3 and v.total = 3, 'servir suelto';
  -- No pasa de lo pedido en el combo ni baja de 0
  begin perform public.servir('00000000-0000-0000-0000-0000000000f1', 7); ok := false; exception when others then ok := true; end;
  assert ok, 'combo pasó de lo pedido';
  begin perform public.servir('00000000-0000-0000-0000-0000000000f2', -4); ok := false; exception when others then ok := true; end;
  assert ok, 'consumo negativo';
  -- Sumar unidades al combo
  v := public.sumar_unidades('00000000-0000-0000-0000-0000000000f1', 12);
  assert v.total = 24, 'sumar_unidades';
  -- Sin tasa guardada y tasa del teléfono en 0: no cobra
  begin perform public.cobrar_pedido('00000000-0000-0000-0000-0000000000d1', 'Efectivo', null, 0); ok := false; exception when others then ok := true; end;
  assert ok, 'cobró sin tasa';
end $$;
reset role;

-- Con tasa del día guardada, el cobro usa esa (no la del teléfono ni la del pedido)
insert into public.tasas_bcv (sucursal_id, tasa, fecha) values ('00000000-0000-0000-0000-00000000000a', 195.5, privado.hoy_caracas());
set role authenticated;
do $$ declare j json; begin
  j := public.cobrar_pedido('00000000-0000-0000-0000-0000000000d1', 'Pago móvil', null, 530.5);
  assert (j->>'tasa_bcv')::numeric = 195.5, 'tasa del cobro: ' || (j->>'tasa_bcv');
  assert (j->>'total_usd')::numeric = 6 * 1.2 + 3, 'total: ' || (j->>'total_usd');
  begin perform public.servir('00000000-0000-0000-0000-0000000000f1', 1); assert false, 'sirvió en pedido cobrado'; exception when others then null; end;
end $$;
reset role;
do $$ begin
  assert (select tasa_bcv from public.caja limit 1) = 195.5, 'caja.tasa_bcv';
  assert (select tasa_bcv from public.pedidos where id = '00000000-0000-0000-0000-0000000000d1') = 195.5, 'pedido.tasa_bcv';
end $$;

-- Las páginas públicas reciben la tasa vigente
set role anon;
do $$ begin
  assert (public.pedido_publico('00000000-0000-0000-0000-0000000000d1')->>'tasa_actual')::numeric = 195.5, 'pedido_publico.tasa_actual';
  assert (public.sucursal_publica('00000000-0000-0000-0000-00000000000a')->>'tasa_actual')::numeric = 195.5, 'sucursal_publica.tasa_actual';
  assert public.sucursal_publica('00000000-0000-0000-0000-00000000000b')->'tasa_actual' = 'null'::jsonb, 'sucursal sin tasa';
end $$;
reset role;
\echo 'DINERO OK'
