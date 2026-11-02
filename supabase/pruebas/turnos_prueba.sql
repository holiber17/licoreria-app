-- ==========================================================
-- Prueba de supabase/turnos.sql en un Postgres local (NO en Supabase).
-- Uso igual que las otras pruebas:
--   docker exec licor-pg psql -U postgres -v ON_ERROR_STOP=1 -f /sql/pruebas/turnos_prueba.sql
-- Parte de dinero_prueba.sql (que ya cobró un pedido sin turno).
-- ==========================================================
\i /sql/pruebas/dinero_prueba.sql

-- privado.es_personal_de como en supabase/seguridad.sql
create or replace function privado.es_personal_de(suc uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and (rol = 'dueno' or sucursal_id = suc)) $$;
grant execute on function privado.es_personal_de(uuid) to authenticated;

\i /sql/turnos.sql
\i /sql/turnos.sql
\echo 'turnos.sql aplicado dos veces sin error'

-- Dos pedidos nuevos para cobrar dentro del turno
insert into public.pedidos (id, sucursal_id, cliente_nombre) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Mesa 1'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'Mesa 2');
insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ron', 'suelto', 1, 1, 28),
  ('00000000-0000-0000-0000-0000000000a2', 'Whisky', 'suelto', 1, 1, 42);

set role authenticated;
set prueba.uid = '00000000-0000-0000-0000-0000000000e1';
do $$
declare t public.turnos; ok boolean; j json;
begin
  -- No puede abrir en una sucursal que no es suya
  begin perform public.abrir_turno('00000000-0000-0000-0000-00000000000b', 0, 0); ok := false; exception when others then ok := true; end;
  assert ok, 'abrió turno en otra sucursal';
  t := public.abrir_turno('00000000-0000-0000-0000-00000000000a', 20, 391);
  -- Solo un turno abierto a la vez
  begin perform public.abrir_turno('00000000-0000-0000-0000-00000000000a', 0, 0); ok := false; exception when others then ok := true; end;
  assert ok, 'dos turnos abiertos';
  -- Los cobros quedan en el turno
  j := public.cobrar_pedido('00000000-0000-0000-0000-0000000000a1', 'Efectivo', null, 0);
  assert (j->>'turno_id')::uuid = t.id, 'cobro sin turno';
  perform public.cobrar_pedido('00000000-0000-0000-0000-0000000000a2', 'Pago móvil', null, 0);
  -- Cierre: efectivo esperado = 28 + fondo 20 $ + 391 Bs (2 $ a 195,5) = 50 $.
  -- Se cuentan 45 $ + 391 Bs = 47 $ → faltan 3 $. Pago móvil: 42 × 195,5 = 8211 Bs, contados 8211.
  t := public.cerrar_turno(t.id, '{"efectivo_usd": 45, "efectivo_bs": 391, "pago_movil_bs": 8211}'::jsonb, 'Faltó vuelto');
  assert t.cerrado_at is not null, 'no cerró';
  assert t.diferencia_usd = -3, 'diferencia: ' || t.diferencia_usd;
  assert (t.esperado->'Efectivo'->>'usd')::numeric = 28, 'esperado efectivo';
  assert (t.esperado->'Pago móvil'->>'bs')::numeric = 8211, 'esperado pago móvil';
  -- No se cierra dos veces
  begin perform public.cerrar_turno(t.id, '{}'::jsonb, null); ok := false; exception when others then ok := true; end;
  assert ok, 'cerró dos veces';
  -- Sin turno abierto se cobra igual
  insert into public.pedidos (id, sucursal_id, cliente_nombre) values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a', 'Mesa 3');
end $$;
reset role;
insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values ('00000000-0000-0000-0000-0000000000a3', 'Hielo', 'suelto', 1, 1, 1);
set role authenticated;
do $$ declare j json; begin
  j := public.cobrar_pedido('00000000-0000-0000-0000-0000000000a3', 'Efectivo', null, 0);
  assert j->>'turno_id' is null, 'cobro sin turno debería quedar sin turno';
end $$;
-- Sin sesión no se ve ningún turno ni se puede abrir
reset role;
set role anon;
do $$ declare ok boolean; begin
  begin perform public.abrir_turno('00000000-0000-0000-0000-00000000000a', 0, 0); ok := false; exception when others then ok := true; end;
  assert ok, 'anon abrió turno';
end $$;
reset role;
\echo 'TURNOS OK'
