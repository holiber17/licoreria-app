-- ==========================================================
-- LicorApp — dinero y aislamiento (inspección de noviembre de 2026)
--
-- 1) Mover una sucursal de negocio dejaba al dueño anterior con acceso: el
--    dueño conservaba su sucursal_id viejo y es_personal_de lo dejaba pasar
--    por ahí. Ahora la sucursal solo cuenta para el rol "empleado"; el dueño
--    entra por su negocio. Además, al mover una sucursal, sus dueños pasan a
--    otra sucursal de su propio negocio (siguen siendo dueños de él).
-- 2) El empleado podía alterar el dinero por la API (políticas "for all"):
--    - caja: solo lectura. Las filas nacen en cobrar_pedido.
--    - pedidos: sin borrar; un pedido cobrado o cancelado no se reabre ni se
--      cambia, y solo se pasa a "cobrado" dentro de cobrar_pedido.
--    - pedido_items: no se tocan en un pedido cerrado; el empleado no cambia
--      precios ni agrega líneas a 0 $ (el dueño sí).
--    - un solo cobro por pedido (índice único en caja.pedido_id).
--    - cobrar_pedido pasa a security definer y comprueba la sucursal.
--    - tasas_bcv: la tasa debe ser mayor que 0; el empleado no la pone con
--      fecha futura ni a más de 25 % de la tasa guardada antes. El dueño sí.
--    - método de pago: Efectivo, Pago móvil, Transferencia o Zelle.
--
-- Requiere negocios.sql y turnos.sql. Se puede ejecutar más de una vez.
-- La app no cambia: no escribe en caja, no borra pedidos y cobra con la
-- función. Quien use el editor SQL o la clave de servicio (auth.uid() vacío)
-- no pasa por las guardas.
-- ==========================================================

-- ---------- 1) El dueño entra por su negocio, no por una sucursal vieja ----------
create or replace function privado.es_personal_de(suc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_dueno_de(suc)
      or exists (select 1 from public.perfiles where id = auth.uid() and rol = 'empleado' and sucursal_id = suc) $$;

-- Al mover una sucursal a otro negocio, sus dueños quedan en otra sucursal de
-- su negocio (o sin sucursal si no tienen otra). Los empleados siguen a su sucursal.
create or replace function privado.sacar_duenos_al_mover() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.negocio_id is distinct from old.negocio_id then
    update public.perfiles p
       set sucursal_id = (select s.id from public.sucursales s
                           where s.negocio_id = p.negocio_id and s.id <> new.id
                           order by s.nombre, s.id limit 1)
     where p.rol = 'dueno' and p.sucursal_id = new.id
       and p.negocio_id is distinct from new.negocio_id;
  end if;
  return new;
end $$;
drop trigger if exists sacar_duenos_al_mover on public.sucursales;
create trigger sacar_duenos_al_mover after update of negocio_id on public.sucursales
  for each row execute function privado.sacar_duenos_al_mover();

-- ---------- 2) Dinero ----------
-- Fuera lo que RLS no cubre (vaciar la tabla, disparadores, referencias)
revoke truncate, trigger, references on public.caja, public.pedidos, public.pedido_items, public.tasas_bcv from authenticated;

-- caja: solo lectura para el personal
drop policy if exists "gestionar_caja" on public.caja;
drop policy if exists "ver caja" on public.caja;
create policy "ver caja" on public.caja for select to authenticated
  using (privado.es_personal_de(sucursal_id));
revoke insert, update, delete on public.caja from authenticated;

-- Un cobro por pedido
create unique index if not exists caja_pedido_unico on public.caja (pedido_id) where pedido_id is not null;

alter table public.caja drop constraint if exists caja_metodo_pago_valido;
alter table public.caja add constraint caja_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('Efectivo', 'Pago móvil', 'Transferencia', 'Zelle'));

-- pedidos: ver, crear y actualizar; nadie borra (se cancela)
drop policy if exists "gestionar_pedidos" on public.pedidos;
drop policy if exists "ver pedidos" on public.pedidos;
drop policy if exists "crear pedidos" on public.pedidos;
drop policy if exists "actualizar pedidos" on public.pedidos;
create policy "ver pedidos" on public.pedidos for select to authenticated
  using (privado.es_personal_de(sucursal_id));
create policy "crear pedidos" on public.pedidos for insert to authenticated
  with check (privado.es_personal_de(sucursal_id));
create policy "actualizar pedidos" on public.pedidos for update to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));
revoke delete on public.pedidos from authenticated;

create or replace function privado.guardia_pedido() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.sucursal_id is distinct from old.sucursal_id then
    raise exception 'Un pedido no cambia de sucursal' using errcode = 'P0001';
  end if;
  if old.estado is distinct from 'abierto'
     and (new.estado is distinct from old.estado or new.tasa_bcv is distinct from old.tasa_bcv) then
    raise exception 'Un pedido cobrado o cancelado no se puede reabrir ni cambiar' using errcode = 'P0001';
  end if;
  if new.estado = 'cobrado' and old.estado = 'abierto'
     and coalesce(current_setting('privado.cobrando', true), '') <> '1' then
    raise exception 'Un pedido solo se cobra con cobrar_pedido' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guardia_pedido on public.pedidos;
create trigger guardia_pedido before update on public.pedidos
  for each row execute function privado.guardia_pedido();

-- pedido_items: nada en un pedido cerrado; precio fijo para el empleado
create or replace function privado.guardia_item() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_estado text; v_suc uuid;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  select estado, sucursal_id into v_estado, v_suc from public.pedidos where id = coalesce(new.pedido_id, old.pedido_id);
  -- Sin pedido: se está borrando el pedido entero en cascada
  if not found then return coalesce(new, old); end if;
  if v_estado is distinct from 'abierto' then
    raise exception 'El pedido ya no está abierto' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.precio_usd is null or (new.precio_usd <= 0 and not privado.es_dueno_de(v_suc)) then
      raise exception 'El precio debe ser mayor que 0' using errcode = 'P0001';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.pedido_id is distinct from old.pedido_id then
      raise exception 'Una línea no cambia de pedido' using errcode = 'P0001';
    end if;
    if new.precio_usd is distinct from old.precio_usd and not privado.es_dueno_de(v_suc) then
      raise exception 'Solo el dueño cambia el precio de una línea' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists guardia_item on public.pedido_items;
create trigger guardia_item before insert or update or delete on public.pedido_items
  for each row execute function privado.guardia_item();

-- tasas_bcv: ver, poner y corregir; borrar solo el dueño
drop policy if exists "personal de la sucursal" on public.tasas_bcv;
drop policy if exists "ver tasas" on public.tasas_bcv;
drop policy if exists "poner tasas" on public.tasas_bcv;
drop policy if exists "corregir tasas" on public.tasas_bcv;
drop policy if exists "dueno borra tasas" on public.tasas_bcv;
create policy "ver tasas" on public.tasas_bcv for select to authenticated
  using (privado.es_personal_de(sucursal_id));
create policy "poner tasas" on public.tasas_bcv for insert to authenticated
  with check (privado.es_personal_de(sucursal_id));
create policy "corregir tasas" on public.tasas_bcv for update to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));
create policy "dueno borra tasas" on public.tasas_bcv for delete to authenticated
  using (privado.es_dueno_de(sucursal_id));

create or replace function privado.guardia_tasa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_prev numeric;
begin
  if auth.uid() is null then return new; end if;
  if new.tasa is null or new.tasa <= 0 then
    raise exception 'La tasa debe ser mayor que 0' using errcode = 'P0001';
  end if;
  if privado.es_dueno_de(new.sucursal_id) then return new; end if;
  if new.fecha > privado.hoy_caracas() then
    raise exception 'La tasa no puede tener fecha futura' using errcode = 'P0001';
  end if;
  select t.tasa into v_prev from public.tasas_bcv t
   where t.sucursal_id = new.sucursal_id and t.fecha < new.fecha and t.tasa > 0
   order by t.fecha desc limit 1;
  if v_prev is not null and abs(new.tasa - v_prev) / v_prev > 0.25 then
    raise exception 'La tasa cambia más de 25 %% respecto a la anterior (%). Avisa al dueño.', v_prev using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guardia_tasa on public.tasas_bcv;
create trigger guardia_tasa before insert or update on public.tasas_bcv
  for each row execute function privado.guardia_tasa();

-- Cobro: igual que en turnos.sql, pero security definer (caja ya no se escribe
-- con los permisos del usuario) y comprobando que trabaja en esa sucursal.
create or replace function public.cobrar_pedido(p_pedido uuid, p_metodo text, p_nota text, p_tasa numeric)
returns json language plpgsql security definer set search_path = '' as $$
declare v_ped public.pedidos%rowtype; v_total numeric; v_caja uuid; v_tasa numeric; v_turno uuid;
        v_nota text := nullif(trim(coalesce(p_nota, '')), ''); it record; v_inv uuid; v_stock numeric;
        v_metodo text := coalesce(nullif(trim(p_metodo), ''), 'Efectivo');
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found or not privado.es_personal_de(v_ped.sucursal_id) then
    raise exception 'Pedido no encontrado' using errcode = 'P0002';
  end if;
  if v_ped.estado <> 'abierto' then raise exception 'Este pedido ya fue cobrado o cancelado' using errcode = 'P0001'; end if;
  if v_metodo not in ('Efectivo', 'Pago móvil', 'Transferencia', 'Zelle') then
    raise exception 'Método de pago no válido' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.pedido_items where pedido_id = p_pedido and consumido > 0) then raise exception 'No hay nada consumido aún' using errcode = 'P0001'; end if;
  v_tasa := coalesce(privado.tasa_vigente(v_ped.sucursal_id), nullif(greatest(coalesce(p_tasa, 0), 0), 0));
  if v_tasa is null then
    raise exception 'No hay tasa BCV del día. El dueño debe ponerla a mano antes de cobrar.' using errcode = 'P0001';
  end if;
  select t.id into v_turno from public.turnos t where t.sucursal_id = v_ped.sucursal_id and t.cerrado_at is null;
  select coalesce(sum(consumido * precio_usd), 0) into v_total from public.pedido_items where pedido_id = p_pedido and consumido > 0;
  perform set_config('privado.cobrando', '1', true);
  update public.pedidos set estado = 'cobrado', nota = v_nota, tasa_bcv = v_tasa where id = p_pedido;
  perform set_config('privado.cobrando', '', true);
  insert into public.caja (sucursal_id, pedido_id, usuario_id, cliente_nombre, cliente_id, total_usd, tasa_bcv, nota, metodo_pago, fecha, turno_id)
  values (v_ped.sucursal_id, p_pedido, auth.uid(), v_ped.cliente_nombre, v_ped.cliente_id, v_total, v_tasa, v_nota, v_metodo, now(), v_turno) returning id into v_caja;
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
  return json_build_object('caja_id', v_caja, 'total_usd', v_total, 'tasa_bcv', v_tasa, 'turno_id', v_turno);
end $$;
revoke all on function public.cobrar_pedido(uuid, text, text, numeric) from public, anon;
grant execute on function public.cobrar_pedido(uuid, text, text, numeric) to authenticated;
