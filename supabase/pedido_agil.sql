-- ==========================================================
-- LicorApp — agregar productos al pedido de forma ágil
-- Aplicado en Supabase como migración "agregar_al_pedido".
--
-- Agrega varios productos del menú en una sola llamada:
-- - Suelto: se cuenta como servido de una vez (consumido = cantidad).
--   Si ya estaba en la cuenta, se suma a la misma línea.
-- - Combo: suma las unidades del combo; si ya había uno igual,
--   se agregan a esa misma línea (como "reabastecer").
-- El precio y el nombre se toman del menú en el servidor.
-- SECURITY INVOKER: respeta los permisos (RLS) de quien la llama.
-- ==========================================================

create or replace function public.agregar_al_pedido(p_pedido uuid, p_items jsonb)
returns setof public.pedido_items
language plpgsql security invoker set search_path = '' as $$
declare
  v_ped  public.pedidos%rowtype;
  it     jsonb;
  m      public.menu%rowtype;
  n      integer;
  v_item public.pedido_items%rowtype;
  v_hay  boolean;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_ped.estado <> 'abierto' then
    raise exception 'Este pedido ya está cerrado' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos para agregar' using errcode = 'P0001';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    n := (it->>'cantidad')::integer;
    if n is null or n < 1 or n > 500 then
      raise exception 'Cantidad inválida' using errcode = 'P0001';
    end if;

    select * into m from public.menu
    where id = (it->>'menu_id')::uuid and sucursal_id = v_ped.sucursal_id and activo;
    if not found then
      raise exception 'Un producto ya no está disponible en el menú' using errcode = 'P0001';
    end if;

    select * into v_item from public.pedido_items
    where pedido_id = p_pedido and menu_id = m.id and tipo = m.tipo
    order by id limit 1 for update;
    v_hay := found;

    if m.tipo = 'combo' then
      if v_hay then
        update public.pedido_items set total = total + m.unidades_combo * n
        where id = v_item.id returning * into v_item;
      else
        insert into public.pedido_items (pedido_id, menu_id, nombre, tipo, total, consumido, precio_usd, unidad)
        values (p_pedido, m.id, m.nombre, 'combo', m.unidades_combo * n, 0, m.precio_usd, m.unidad)
        returning * into v_item;
      end if;
    else
      if v_hay then
        update public.pedido_items set consumido = consumido + n, total = consumido + n
        where id = v_item.id returning * into v_item;
      else
        insert into public.pedido_items (pedido_id, menu_id, nombre, tipo, total, consumido, precio_usd, unidad)
        values (p_pedido, m.id, m.nombre, m.tipo, n, n, m.precio_usd, m.unidad)
        returning * into v_item;
      end if;
    end if;

    return next v_item;
  end loop;
end;
$$;

revoke all on function public.agregar_al_pedido(uuid, jsonb) from public, anon;
grant execute on function public.agregar_al_pedido(uuid, jsonb) to authenticated;
