-- ==========================================================
-- Prueba de supabase/dinero_seguro.sql en un Postgres local (NO en Supabase).
-- Parte de negocios_prueba.sql (que incluye todas las anteriores).
-- Sucursal movida de negocio, y un empleado que intenta alterar el dinero.
-- ==========================================================
\i /sql/pruebas/negocios_prueba.sql

alter table public.tasas_bcv enable row level security;   -- en producción ya la tiene

\i /sql/dinero_seguro.sql
\i /sql/dinero_seguro.sql
\echo 'dinero_seguro.sql aplicado dos veces sin error'

-- ---------- Datos ----------
-- Sucursal c en el negocio principal; el dueño uno está asignado a ella
insert into public.sucursales (id, nombre, negocio_id)
  select '00000000-0000-0000-0000-00000000000c', 'Movible', negocio_id from public.sucursales where id = '00000000-0000-0000-0000-00000000000a';
update public.perfiles set sucursal_id = '00000000-0000-0000-0000-00000000000c' where nombre = 'Dueño uno';
insert into public.pedidos (id, sucursal_id, cliente_nombre) values ('00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000000c', 'Mesa movible');

-- Tasas de la sucursal a: ayer 100
delete from public.tasas_bcv where sucursal_id = '00000000-0000-0000-0000-00000000000a';
insert into public.tasas_bcv (sucursal_id, tasa, fecha) values ('00000000-0000-0000-0000-00000000000a', 100, privado.hoy_caracas() - 1);

-- Pedido abierto con consumo en a, y otro en b
insert into public.pedidos (id, sucursal_id, cliente_nombre) values
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-00000000000a', 'Mesa 5'),
  ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-00000000000a', 'Mesa 7'),
  ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-00000000000b', 'Mesa 6');
insert into public.pedido_items (id, pedido_id, nombre, tipo, total, consumido, precio_usd) values
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000d5', 'Ron', 'suelto', 2, 2, 10),
  ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000d7', 'Vino', 'suelto', 1, 1, 8),
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000d6', 'Cerveza', 'suelto', 1, 1, 2);

-- Un metodo fuera de la lista no entra a caja ni por SQL directo
do $$ declare ok boolean; begin
  begin insert into public.caja (sucursal_id, total_usd, metodo_pago) values ('00000000-0000-0000-0000-00000000000a', 1, 'Bitcoin'); ok := false;
  exception when check_violation then ok := true; end;
  assert ok, 'caja aceptó un método de pago inventado';
end $$;

-- ---------- 1) Sucursal movida: el dueño anterior pierde el acceso ----------
-- (el sudo la mueve al otro negocio)
set role authenticated;
set prueba.uid = '00000000-0000-0000-0000-0000000000a5';
update public.sucursales set negocio_id = '00000000-0000-0000-0000-0000000000f2' where id = '00000000-0000-0000-0000-00000000000c';
reset role;
do $$ declare s uuid; begin
  select sucursal_id into s from public.perfiles where nombre = 'Dueño uno';
  assert s = '00000000-0000-0000-0000-00000000000a', 'el dueño no pasó a otra sucursal de su negocio: ' || coalesce(s::text, 'null');
  assert (select negocio_id from public.perfiles where nombre = 'Dueño uno') = (select negocio_id from public.sucursales where id = '00000000-0000-0000-0000-00000000000a'), 'el dueño cambió de negocio';
end $$;

-- Aun con un sucursal_id viejo (perfil sin ordenar), no entra por ahí
update public.perfiles set sucursal_id = '00000000-0000-0000-0000-00000000000c' where nombre = 'Dueño uno';
set role authenticated;
set prueba.uid = '00000000-0000-0000-0000-0000000000d1';
do $$ declare n int; begin
  assert not exists (select 1 from public.sucursales where id = '00000000-0000-0000-0000-00000000000c'), 'el dueño anterior ve la sucursal movida';
  assert not exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000c9'), 'el dueño anterior ve los pedidos de la sucursal movida';
  update public.pedidos set cliente_nombre = 'x' where id = '00000000-0000-0000-0000-0000000000c9';
  get diagnostics n = row_count; assert n = 0, 'el dueño anterior modificó un pedido de la sucursal movida';
  assert exists (select 1 from public.pedidos where id = '00000000-0000-0000-0000-0000000000d5'), 'el dueño no ve su propio negocio';
end $$;
reset role;
update public.perfiles set sucursal_id = '00000000-0000-0000-0000-00000000000a' where nombre = 'Dueño uno';

-- ---------- 2) El empleado no altera el dinero ----------
set role authenticated;
set prueba.uid = '00000000-0000-0000-0000-0000000000e1';   -- Pedro, sucursal a
do $$ declare ok boolean; n int; j json; begin
  -- Tasa: no futura, no cero, no a más de 25 % de la anterior; dentro del límite sí
  begin insert into public.tasas_bcv (sucursal_id, tasa, fecha) values ('00000000-0000-0000-0000-00000000000a', 0, privado.hoy_caracas()); ok := false; exception when others then ok := true; end;
  assert ok, 'tasa 0 aceptada';
  begin insert into public.tasas_bcv (sucursal_id, tasa, fecha) values ('00000000-0000-0000-0000-00000000000a', 105, privado.hoy_caracas() + 1); ok := false; exception when others then ok := true; end;
  assert ok, 'tasa con fecha futura aceptada';
  begin insert into public.tasas_bcv (sucursal_id, tasa, fecha) values ('00000000-0000-0000-0000-00000000000a', 130, privado.hoy_caracas()); ok := false; exception when others then ok := true; end;
  assert ok, 'tasa a más de 25 % aceptada';
  insert into public.tasas_bcv (sucursal_id, tasa, fecha) values ('00000000-0000-0000-0000-00000000000a', 120, privado.hoy_caracas());
  delete from public.tasas_bcv where sucursal_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count; assert n = 0, 'el empleado borró tasas';

  -- Caja: la ve, no la escribe
  assert exists (select 1 from public.caja where sucursal_id = '00000000-0000-0000-0000-00000000000a'), 'el empleado no ve la caja';
  begin delete from public.caja; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado borró de caja';
  begin update public.caja set total_usd = 0; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado editó caja';
  begin insert into public.caja (sucursal_id, total_usd) values ('00000000-0000-0000-0000-00000000000a', 1); ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado escribió en caja';

  -- Pedidos: no se borran; no se cobran a mano; no se cobra el de otra sucursal
  begin delete from public.pedidos where id = '00000000-0000-0000-0000-0000000000d7'; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado borró un pedido';
  begin update public.pedidos set estado = 'cobrado' where id = '00000000-0000-0000-0000-0000000000d7'; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado marcó un pedido como cobrado sin cobrarlo';
  begin perform public.cobrar_pedido('00000000-0000-0000-0000-0000000000d6', 'Efectivo', null, 100); ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado cobró un pedido de otra sucursal';
  begin perform public.cobrar_pedido('00000000-0000-0000-0000-0000000000d7', 'Cheque', null, 100); ok := false; exception when others then ok := true; end;
  assert ok, 'se cobró con un método inventado';

  -- Líneas: precio fijo, sin líneas a 0 $
  begin insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values ('00000000-0000-0000-0000-0000000000d5', 'Gratis', 'suelto', 1, 1, 0); ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado agregó una línea a 0 $';
  begin update public.pedido_items set precio_usd = 0 where id = '00000000-0000-0000-0000-0000000000e5'; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado cambió un precio';
  insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values ('00000000-0000-0000-0000-0000000000d5', 'Hielo', 'suelto', 1, 1, 1.5);
  perform public.servir('00000000-0000-0000-0000-0000000000e5', 0);

  -- Cobro normal, y después nada se reabre ni se cobra dos veces
  j := public.cobrar_pedido('00000000-0000-0000-0000-0000000000d5', 'Efectivo', null, 100);
  assert (j->>'total_usd')::numeric = 21.5, 'total del cobro: ' || (j->>'total_usd');
  begin perform public.cobrar_pedido('00000000-0000-0000-0000-0000000000d5', 'Efectivo', null, 100); ok := false; exception when others then ok := true; end;
  assert ok, 'doble cobro';
  begin update public.pedidos set estado = 'abierto' where id = '00000000-0000-0000-0000-0000000000d5'; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado reabrió un pedido cobrado';
  begin update public.pedido_items set consumido = 0 where id = '00000000-0000-0000-0000-0000000000e5'; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado cambió una línea de un pedido cobrado';
  begin delete from public.pedido_items where id = '00000000-0000-0000-0000-0000000000e5'; ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado borró una línea de un pedido cobrado';
  begin insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values ('00000000-0000-0000-0000-0000000000d5', 'Tarde', 'suelto', 1, 1, 5); ok := false; exception when others then ok := true; end;
  assert ok, 'el empleado agregó una línea a un pedido cobrado';
  select count(*) into n from public.caja where pedido_id = '00000000-0000-0000-0000-0000000000d5';
  assert n = 1, 'el pedido tiene ' || n || ' filas en caja';
end $$;

-- ---------- Dueño: sí puede lo que el empleado no ----------
set prueba.uid = '00000000-0000-0000-0000-0000000000d1';
do $$ declare ok boolean; n int; begin
  update public.pedido_items set precio_usd = 9 where id = '00000000-0000-0000-0000-0000000000e7';
  get diagnostics n = row_count; assert n = 1, 'el dueño no cambió un precio';
  insert into public.pedido_items (pedido_id, nombre, tipo, total, consumido, precio_usd) values ('00000000-0000-0000-0000-0000000000d7', 'Cortesía', 'suelto', 1, 1, 0);
  insert into public.tasas_bcv (sucursal_id, tasa, fecha) values ('00000000-0000-0000-0000-00000000000a', 300, privado.hoy_caracas() - 2);
  -- Tampoco el dueño reabre un pedido cobrado ni borra pedidos
  begin update public.pedidos set estado = 'abierto' where id = '00000000-0000-0000-0000-0000000000d5'; ok := false; exception when others then ok := true; end;
  assert ok, 'el dueño reabrió un pedido cobrado';
  begin delete from public.pedidos where id = '00000000-0000-0000-0000-0000000000d7'; ok := false; exception when others then ok := true; end;
  assert ok, 'el dueño borró un pedido';
end $$;
reset role;

-- Un cobro duplicado no entra ni por SQL directo
do $$ declare ok boolean; begin
  begin insert into public.caja (sucursal_id, pedido_id, total_usd) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d5', 1); ok := false;
  exception when unique_violation then ok := true; end;
  assert ok, 'caja aceptó dos cobros del mismo pedido';
end $$;
\echo 'DINERO SEGURO OK'
