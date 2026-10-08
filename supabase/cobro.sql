-- ==========================================================
-- LicorApp — cobro e inventario seguros
-- Aplicado en Supabase como migración "cobro_seguro".
--
-- Antes el teléfono hacía cada paso del cobro por separado (cerrar el
-- pedido, registrar en caja, descontar stock): si se caía el internet a
-- mitad quedaba a medias, un doble toque podía cobrar dos veces y dos
-- teléfonos podían pisarse el stock. Ahora todo pasa dentro de la base,
-- en una sola transacción.
-- Las funciones son SECURITY INVOKER: respetan los mismos permisos (RLS)
-- que el usuario que las llama.
-- ==========================================================

-- ---------- Enlace menú ↔ inventario por ID ----------
-- inventario.menu_id ya existía; ahora cada ítem del pedido guarda
-- también de qué producto del menú salió.
alter table public.pedido_items
  add column if not exists menu_id uuid references public.menu(id) on delete set null;
create index if not exists inventario_menu_idx on public.inventario (menu_id);

-- Enlazar lo que hoy coincide exactamente por nombre (solo si hay una
-- única coincidencia en el menú de esa sucursal).
update public.inventario i
set menu_id = m.id
from public.menu m
where i.menu_id is null
  and m.sucursal_id = i.sucursal_id
  and m.activo
  and lower(trim(m.nombre)) = lower(trim(i.nombre))
  and (select count(*) from public.menu m2
       where m2.sucursal_id = i.sucursal_id and m2.activo
         and lower(trim(m2.nombre)) = lower(trim(i.nombre))) = 1;

-- ---------- Cobrar un pedido (todo o nada) ----------
create or replace function public.cobrar_pedido(
  p_pedido uuid, p_metodo text, p_nota text, p_tasa numeric
) returns json
language plpgsql security invoker set search_path = '' as $$
declare
  v_ped   public.pedidos%rowtype;
  v_total numeric;
  v_caja  uuid;
  v_nota  text := nullif(trim(coalesce(p_nota, '')), '');
  it      record;
  v_inv   uuid;
  v_stock numeric;
begin
  -- Bloquea el pedido: un segundo cobro simultáneo espera y luego falla.
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_ped.estado <> 'abierto' then
    raise exception 'Este pedido ya fue cobrado o cancelado' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pedido_items where pedido_id = p_pedido and consumido > 0) then
    raise exception 'No hay nada consumido aún' using errcode = 'P0001';
  end if;

  -- El total se calcula aquí, no en el teléfono.
  select coalesce(sum(consumido * precio_usd), 0) into v_total
  from public.pedido_items where pedido_id = p_pedido and consumido > 0;

  update public.pedidos
  set estado = 'cobrado', nota = v_nota, tasa_bcv = p_tasa
  where id = p_pedido;

  insert into public.caja (sucursal_id, pedido_id, usuario_id, cliente_nombre, cliente_id,
                           total_usd, tasa_bcv, nota, metodo_pago, fecha)
  values (v_ped.sucursal_id, p_pedido, auth.uid(), v_ped.cliente_nombre, v_ped.cliente_id,
          v_total, p_tasa, v_nota, coalesce(nullif(trim(p_metodo), ''), 'Efectivo'), now())
  returning id into v_caja;

  -- Descontar inventario: primero por enlace (menu_id), si no, por nombre.
  for it in
    select * from public.pedido_items where pedido_id = p_pedido and consumido > 0
  loop
    v_inv := null;
    select i.id, i.stock_actual into v_inv, v_stock
    from public.inventario i
    where i.sucursal_id = v_ped.sucursal_id
      and ((it.menu_id is not null and i.menu_id = it.menu_id)
           or lower(trim(i.nombre)) = lower(trim(it.nombre)))
    order by (it.menu_id is not null and i.menu_id = it.menu_id) desc, i.created_at
    limit 1
    for update;

    if v_inv is not null and v_stock > 0 then
      update public.inventario
      set stock_actual = greatest(0, stock_actual - it.consumido), updated_at = now()
      where id = v_inv;
      insert into public.inventario_movimientos (inventario_id, sucursal_id, usuario_id, tipo, cantidad, motivo)
      values (v_inv, v_ped.sucursal_id, auth.uid(), 'salida', it.consumido, 'Venta: ' || v_ped.cliente_nombre);
    end if;
  end loop;

  return json_build_object('caja_id', v_caja, 'total_usd', v_total);
end;
$$;

-- ---------- Entrada / salida / ajuste de stock ----------
create or replace function public.mover_stock(
  p_inventario uuid, p_tipo text, p_cantidad numeric, p_motivo text
) returns numeric
language plpgsql security invoker set search_path = '' as $$
declare
  v       public.inventario%rowtype;
  v_nuevo numeric;
begin
  if p_tipo not in ('entrada', 'salida', 'ajuste') then
    raise exception 'Tipo de movimiento inválido' using errcode = 'P0001';
  end if;
  if p_cantidad is null or p_cantidad < 0 or (p_cantidad = 0 and p_tipo <> 'ajuste') then
    raise exception 'Cantidad inválida' using errcode = 'P0001';
  end if;

  select * into v from public.inventario where id = p_inventario for update;
  if not found then
    raise exception 'Producto no encontrado' using errcode = 'P0002';
  end if;

  v_nuevo := case p_tipo
    when 'entrada' then v.stock_actual + p_cantidad
    when 'salida'  then greatest(0, v.stock_actual - p_cantidad)
    else p_cantidad
  end;

  update public.inventario set stock_actual = v_nuevo, updated_at = now() where id = p_inventario;
  insert into public.inventario_movimientos (inventario_id, sucursal_id, usuario_id, tipo, cantidad, motivo)
  values (p_inventario, v.sucursal_id, auth.uid(), p_tipo, p_cantidad, nullif(trim(coalesce(p_motivo, '')), ''));

  return v_nuevo;
end;
$$;

revoke all on function public.cobrar_pedido(uuid, text, text, numeric) from public, anon;
revoke all on function public.mover_stock(uuid, text, numeric, text) from public, anon;
grant execute on function public.cobrar_pedido(uuid, text, text, numeric) to authenticated;
grant execute on function public.mover_stock(uuid, text, numeric, text) to authenticated;
