-- ==========================================================
-- LicorApp — cobrar bien
--
-- 1) Servir y sumar unidades con sumas en la base: antes el teléfono mandaba
--    el número final, y si dos mesoneros tocaban "+" a la vez se perdía uno.
-- 2) Una sola tasa: la del día guardada en tasas_bcv. La usa el cobro, la
--    página del cliente y la carta. Sin tasa no se cobra (antes quedaba 530).
--
-- Requiere supabase/acceso_publico.sql (fase 1). Se puede ejecutar más de
-- una vez sin romper nada. Funciona con la versión vieja de la app.
-- ==========================================================

-- Fecha de hoy en Venezuela (la base corre en UTC)
create or replace function privado.hoy_caracas()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Caracas')::date $$;

-- Tasa vigente de una sucursal: la última guardada en los últimos 3 días
create or replace function privado.tasa_vigente(suc uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select t.tasa from public.tasas_bcv t
  where t.sucursal_id = suc and t.tasa > 0 and t.fecha >= privado.hoy_caracas() - 3
  order by t.fecha desc limit 1 $$;
revoke all on function privado.hoy_caracas() from public, anon;
revoke all on function privado.tasa_vigente(uuid) from public, anon;
grant execute on function privado.hoy_caracas() to authenticated;
grant execute on function privado.tasa_vigente(uuid) to authenticated;

-- 1) Servir: suma (o resta) unidades a lo servido de una línea.
--    Combo: no pasa de lo pedido. Suelto: lo pedido sigue a lo servido.
--    Devuelve la línea actualizada. Respeta RLS (security invoker).
create or replace function public.servir(p_item uuid, p_delta integer)
returns public.pedido_items language plpgsql security invoker set search_path = '' as $$
declare v public.pedido_items;
begin
  update public.pedido_items i
     set consumido = i.consumido + p_delta,
         total = case when i.tipo = 'suelto' then i.consumido + p_delta else i.total end
   where i.id = p_item
     and i.consumido + p_delta >= 0
     and (i.tipo = 'suelto' or i.consumido + p_delta <= i.total)
     and exists (select 1 from public.pedidos p where p.id = i.pedido_id and p.estado = 'abierto')
  returning i.* into v;
  if not found then
    raise exception 'No se pudo servir: el pedido cambió o ya no está abierto' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Sumar unidades a lo pedido de un combo ("reabastecer")
create or replace function public.sumar_unidades(p_item uuid, p_unidades integer)
returns public.pedido_items language plpgsql security invoker set search_path = '' as $$
declare v public.pedido_items;
begin
  if p_unidades is null or p_unidades < 1 then
    raise exception 'Cantidad inválida' using errcode = 'P0001';
  end if;
  update public.pedido_items i set total = i.total + p_unidades
   where i.id = p_item
     and exists (select 1 from public.pedidos p where p.id = i.pedido_id and p.estado = 'abierto')
  returning i.* into v;
  if not found then
    raise exception 'El pedido ya no está abierto' using errcode = 'P0001';
  end if;
  return v;
end $$;

revoke all on function public.servir(uuid, integer) from public, anon;
revoke all on function public.sumar_unidades(uuid, integer) from public, anon;
grant execute on function public.servir(uuid, integer) to authenticated;
grant execute on function public.sumar_unidades(uuid, integer) to authenticated;

-- 2) Cobro con la tasa del día de la sucursal. Si no hay ninguna guardada,
--    acepta la del teléfono solo si es mayor que 0. Sin tasa, no cobra.
--    Por lo demás igual que la versión anterior (supabase/cobro.sql).
create or replace function public.cobrar_pedido(p_pedido uuid, p_metodo text, p_nota text, p_tasa numeric)
returns json language plpgsql security invoker set search_path = '' as $$
declare v_ped public.pedidos%rowtype; v_total numeric; v_caja uuid; v_tasa numeric;
        v_nota text := nullif(trim(coalesce(p_nota, '')), ''); it record; v_inv uuid; v_stock numeric;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido no encontrado' using errcode = 'P0002'; end if;
  if v_ped.estado <> 'abierto' then raise exception 'Este pedido ya fue cobrado o cancelado' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.pedido_items where pedido_id = p_pedido and consumido > 0) then raise exception 'No hay nada consumido aún' using errcode = 'P0001'; end if;
  v_tasa := coalesce(privado.tasa_vigente(v_ped.sucursal_id), nullif(greatest(coalesce(p_tasa, 0), 0), 0));
  if v_tasa is null then
    raise exception 'No hay tasa BCV del día. El dueño debe ponerla a mano antes de cobrar.' using errcode = 'P0001';
  end if;
  select coalesce(sum(consumido * precio_usd), 0) into v_total from public.pedido_items where pedido_id = p_pedido and consumido > 0;
  update public.pedidos set estado = 'cobrado', nota = v_nota, tasa_bcv = v_tasa where id = p_pedido;
  insert into public.caja (sucursal_id, pedido_id, usuario_id, cliente_nombre, cliente_id, total_usd, tasa_bcv, nota, metodo_pago, fecha)
  values (v_ped.sucursal_id, p_pedido, auth.uid(), v_ped.cliente_nombre, v_ped.cliente_id, v_total, v_tasa, v_nota, coalesce(nullif(trim(p_metodo), ''), 'Efectivo'), now()) returning id into v_caja;
  for it in select * from public.pedido_items where pedido_id = p_pedido and consumido > 0 loop
    v_inv := null;
    select i.id, i.stock_actual into v_inv, v_stock from public.inventario i
    where i.sucursal_id = v_ped.sucursal_id and ((it.menu_id is not null and i.menu_id = it.menu_id) or lower(trim(i.nombre)) = lower(trim(it.nombre)))
    order by (it.menu_id is not null and i.menu_id = it.menu_id) desc, i.created_at limit 1 for update;
    if v_inv is not null and v_stock > 0 then
      update public.inventario set stock_actual = greatest(0, stock_actual - it.consumido), updated_at = now() where id = v_inv;
      insert into public.inventario_movimientos (inventario_id, sucursal_id, usuario_id, tipo, cantidad, motivo) values (v_inv, v_ped.sucursal_id, auth.uid(), 'salida', it.consumido, 'Venta: ' || v_ped.cliente_nombre);
    end if;
  end loop;
  return json_build_object('caja_id', v_caja, 'total_usd', v_total, 'tasa_bcv', v_tasa);
end $$;

-- 3) Las páginas públicas reciben la tasa vigente de la sucursal
create or replace function public.pedido_publico(p uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pe.id, 'sucursal_id', pe.sucursal_id, 'cliente_nombre', pe.cliente_nombre,
    'mesa', pe.mesa, 'estado', pe.estado, 'tasa_bcv', pe.tasa_bcv, 'created_at', pe.created_at,
    'tasa_actual', privado.tasa_vigente(pe.sucursal_id),
    'pedido_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'menu_id', i.menu_id, 'nombre', i.nombre, 'tipo', i.tipo, 'total', i.total,
        'consumido', i.consumido, 'precio_usd', i.precio_usd, 'unidad', i.unidad) order by i.id)
      from public.pedido_items i where i.pedido_id = pe.id), '[]'::jsonb))
  from public.pedidos pe where pe.id = p;
$$;

create or replace function public.sucursal_publica(p uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'nombre', s.nombre, 'app_nombre', s.app_nombre,
    'logo_url', s.logo_url, 'ciudad', s.ciudad, 'direccion', s.direccion, 'datos_pago', s.datos_pago,
    'tasa_actual', privado.tasa_vigente(s.id))
  from public.sucursales s where s.id = p and coalesce(s.activa, true);
$$;
