-- ==========================================================
-- Prueba de supabase/restricciones_menores.sql en un Postgres local (NO en Supabase).
-- Parte de menu_publico_prueba.sql (que incluye todas las anteriores).
-- ==========================================================
\i /sql/pruebas/menu_publico_prueba.sql

\i /sql/restricciones_menores.sql
\i /sql/restricciones_menores.sql
\echo 'restricciones_menores.sql aplicado dos veces sin error'

do $$ declare ok boolean; v_suc_a uuid := '00000000-0000-0000-0000-00000000000a'; v_suc_b uuid := '00000000-0000-0000-0000-00000000000b'; v_turno_b uuid; begin
  -- 1) NOT NULL en las líneas del pedido
  begin insert into public.pedido_items (pedido_id, nombre, tipo, consumido) values ('00000000-0000-0000-0000-0000000000f5', 'X', 'suelto', null); ok := false;
  exception when not_null_violation then ok := true; end;
  assert ok, 'pedido_items aceptó consumido NULL';
  begin insert into public.pedido_items (pedido_id, nombre, tipo, precio_usd) values ('00000000-0000-0000-0000-0000000000f5', 'X', 'suelto', null); ok := false;
  exception when others then ok := true; end;   -- guardia_item lo rechaza antes que NOT NULL
  assert ok, 'pedido_items aceptó precio_usd NULL';

  -- 2) Cobro con el turno de otra sucursal
  insert into public.turnos (sucursal_id, fondo_usd) values (v_suc_b, 0) returning id into v_turno_b;
  begin insert into public.caja (sucursal_id, total_usd, turno_id) values (v_suc_a, 1, v_turno_b); ok := false;
  exception when foreign_key_violation then ok := true; end;
  assert ok, 'caja aceptó el turno de otra sucursal';
  insert into public.caja (sucursal_id, total_usd, turno_id) values (v_suc_b, 1, v_turno_b);
  insert into public.caja (sucursal_id, total_usd, turno_id) values (v_suc_a, 1, null);

  -- 3) NaN
  begin insert into public.caja (sucursal_id, total_usd) values (v_suc_a, 'NaN'); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'caja aceptó total NaN';
  begin insert into public.turnos (sucursal_id, fondo_usd) values (v_suc_a, 'NaN'); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'turnos aceptó fondo NaN';
  begin insert into public.tasas_bcv (sucursal_id, tasa, fecha) values (v_suc_a, 'NaN', privado.hoy_caracas() - 30); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'tasas_bcv aceptó NaN';
  begin insert into public.pedido_items (pedido_id, nombre, tipo, precio_usd) values ('00000000-0000-0000-0000-0000000000f5', 'X', 'suelto', 'NaN'); ok := false;
  exception when others then ok := true; end;
  assert ok, 'pedido_items aceptó precio NaN';

  -- 4) Borrar una sucursal con historial no se puede
  begin delete from public.sucursales where id = v_suc_a; ok := false;
  exception when foreign_key_violation then ok := true; end;
  assert ok, 'se borró una sucursal con historial';
  assert (select count(*) from public.caja where sucursal_id = v_suc_a) > 0, 'el historial de caja desapareció';
  -- Una sucursal sin historial sí se borra
  insert into public.sucursales (id, nombre) values ('00000000-0000-0000-0000-0000000000fa', 'Vacía');
  delete from public.sucursales where id = '00000000-0000-0000-0000-0000000000fa';
end $$;
\echo 'RESTRICCIONES MENORES OK'
