-- ==========================================================
-- LicorApp — cierre de caja por turno (arqueo)
--
-- Antes la caja se cortaba a medianoche y "Nueva jornada" no hacía nada.
-- Ahora se abre un turno con el fondo de caja, cada cobro queda en el turno
-- abierto, y al cerrar se cuenta lo que hay por método de pago: la base
-- calcula lo esperado y guarda la diferencia.
--
-- Abrir un turno es opcional: sin turno se cobra igual (caja.turno_id vacío).
-- Requiere supabase/dinero.sql. Se puede ejecutar más de una vez.
-- ==========================================================

create table if not exists public.turnos (
  id           uuid primary key default gen_random_uuid(),
  sucursal_id  uuid not null references public.sucursales(id) on delete cascade,
  abierto_por  uuid references auth.users(id),
  abierto_at   timestamptz not null default now(),
  fondo_usd    numeric not null default 0 check (fondo_usd >= 0),
  fondo_bs     numeric not null default 0 check (fondo_bs >= 0),
  cerrado_por  uuid references auth.users(id),
  cerrado_at   timestamptz,
  esperado     jsonb,        -- por método: {"Efectivo": {"usd": .., "bs": ..}, ...}
  contado      jsonb,        -- lo que se contó: {"efectivo_usd", "efectivo_bs", "zelle_usd", "pago_movil_bs", "transferencia_bs"}
  diferencia_usd numeric,    -- contado − esperado, en $ (los Bs a la tasa del cierre)
  tasa_cierre  numeric,
  nota         text check (nota is null or char_length(nota) <= 200)
);
-- Un solo turno abierto por sucursal
create unique index if not exists turnos_uno_abierto on public.turnos (sucursal_id) where cerrado_at is null;
create index if not exists turnos_sucursal_idx on public.turnos (sucursal_id, abierto_at desc);

alter table public.caja add column if not exists turno_id uuid references public.turnos(id);
create index if not exists caja_turno_idx on public.caja (turno_id);

-- Solo lectura para el personal de la sucursal; abrir y cerrar van por las funciones
alter table public.turnos enable row level security;
revoke all on public.turnos from anon;
grant select on public.turnos to authenticated;
drop policy if exists "personal ve turnos" on public.turnos;
create policy "personal ve turnos" on public.turnos
  for select to authenticated using (privado.es_personal_de(sucursal_id));

-- Lo esperado de un turno, por método de pago (incluye el fondo en efectivo)
create or replace function privado.esperado_turno(p_turno uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with ventas as (
    select coalesce(c.metodo_pago, 'Efectivo') as metodo,
           sum(c.total_usd) as usd, sum(c.total_usd * coalesce(c.tasa_bcv, 0)) as bs, count(*) as pedidos
    from public.caja c where c.turno_id = p_turno group by 1
  )
  select coalesce(jsonb_object_agg(metodo, jsonb_build_object('usd', round(usd, 2), 'bs', round(bs, 2), 'pedidos', pedidos)), '{}'::jsonb)
  from ventas $$;
revoke all on function privado.esperado_turno(uuid) from public, anon;

create or replace function public.abrir_turno(p_sucursal uuid, p_fondo_usd numeric default 0, p_fondo_bs numeric default 0)
returns public.turnos language plpgsql security definer set search_path = '' as $$
declare v public.turnos;
begin
  if not privado.es_personal_de(p_sucursal) then
    raise exception 'No perteneces a esta sucursal' using errcode = '42501';
  end if;
  if coalesce(p_fondo_usd, 0) < 0 or coalesce(p_fondo_bs, 0) < 0 then
    raise exception 'El fondo no puede ser negativo' using errcode = 'P0001';
  end if;
  insert into public.turnos (sucursal_id, abierto_por, fondo_usd, fondo_bs)
  values (p_sucursal, auth.uid(), coalesce(p_fondo_usd, 0), coalesce(p_fondo_bs, 0))
  returning * into v;
  return v;
exception when unique_violation then
  raise exception 'Ya hay un turno abierto en esta sucursal' using errcode = 'P0001';
end $$;

-- Cerrar: compara lo contado con lo esperado.
--   Efectivo: $ + Bs (a la tasa del cierre) contra ventas en efectivo + fondo.
--   Zelle: $.  Pago móvil y Transferencia: Bs (lo que entró al banco).
create or replace function public.cerrar_turno(p_turno uuid, p_contado jsonb, p_nota text default null)
returns public.turnos language plpgsql security definer set search_path = '' as $$
declare v public.turnos; esp jsonb; tasa numeric; dif numeric := 0;
        c_ef_usd numeric; c_ef_bs numeric; c_zelle numeric; c_pm numeric; c_tr numeric;
begin
  select * into v from public.turnos where id = p_turno for update;
  if not found then raise exception 'Turno no encontrado' using errcode = 'P0002'; end if;
  if not privado.es_personal_de(v.sucursal_id) then
    raise exception 'No perteneces a esta sucursal' using errcode = '42501';
  end if;
  if v.cerrado_at is not null then raise exception 'Este turno ya está cerrado' using errcode = 'P0001'; end if;

  tasa := privado.tasa_vigente(v.sucursal_id);
  if tasa is null then
    select c.tasa_bcv into tasa from public.caja c where c.turno_id = p_turno and c.tasa_bcv > 0 order by c.fecha desc limit 1;
  end if;
  esp := privado.esperado_turno(p_turno);

  c_ef_usd := greatest(coalesce((p_contado->>'efectivo_usd')::numeric, 0), 0);
  c_ef_bs  := greatest(coalesce((p_contado->>'efectivo_bs')::numeric, 0), 0);
  c_zelle  := greatest(coalesce((p_contado->>'zelle_usd')::numeric, 0), 0);
  c_pm     := greatest(coalesce((p_contado->>'pago_movil_bs')::numeric, 0), 0);
  c_tr     := greatest(coalesce((p_contado->>'transferencia_bs')::numeric, 0), 0);

  -- Efectivo, en $ (los Bs a la tasa del cierre)
  if tasa > 0 then
    dif := dif + (c_ef_usd + c_ef_bs / tasa) - (coalesce((esp->'Efectivo'->>'usd')::numeric, 0) + v.fondo_usd + v.fondo_bs / tasa);
    dif := dif + (c_pm - coalesce((esp->'Pago móvil'->>'bs')::numeric, 0)) / tasa;
    dif := dif + (c_tr - coalesce((esp->'Transferencia'->>'bs')::numeric, 0)) / tasa;
  else
    dif := dif + c_ef_usd - (coalesce((esp->'Efectivo'->>'usd')::numeric, 0) + v.fondo_usd);
  end if;
  dif := dif + c_zelle - coalesce((esp->'Zelle'->>'usd')::numeric, 0);

  update public.turnos set
    cerrado_por = auth.uid(), cerrado_at = now(), esperado = esp,
    contado = jsonb_build_object('efectivo_usd', c_ef_usd, 'efectivo_bs', c_ef_bs, 'zelle_usd', c_zelle, 'pago_movil_bs', c_pm, 'transferencia_bs', c_tr),
    diferencia_usd = round(dif, 2), tasa_cierre = tasa,
    nota = nullif(left(btrim(coalesce(p_nota, '')), 200), '')
  where id = p_turno returning * into v;
  return v;
end $$;

revoke all on function public.abrir_turno(uuid, numeric, numeric) from public, anon;
revoke all on function public.cerrar_turno(uuid, jsonb, text) from public, anon;
grant execute on function public.abrir_turno(uuid, numeric, numeric) to authenticated;
grant execute on function public.cerrar_turno(uuid, jsonb, text) to authenticated;

-- El cobro queda en el turno abierto de la sucursal (si hay uno).
-- Igual que en supabase/dinero.sql, más turno_id.
create or replace function public.cobrar_pedido(p_pedido uuid, p_metodo text, p_nota text, p_tasa numeric)
returns json language plpgsql security invoker set search_path = '' as $$
declare v_ped public.pedidos%rowtype; v_total numeric; v_caja uuid; v_tasa numeric; v_turno uuid;
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
  select t.id into v_turno from public.turnos t where t.sucursal_id = v_ped.sucursal_id and t.cerrado_at is null;
  select coalesce(sum(consumido * precio_usd), 0) into v_total from public.pedido_items where pedido_id = p_pedido and consumido > 0;
  update public.pedidos set estado = 'cobrado', nota = v_nota, tasa_bcv = v_tasa where id = p_pedido;
  insert into public.caja (sucursal_id, pedido_id, usuario_id, cliente_nombre, cliente_id, total_usd, tasa_bcv, nota, metodo_pago, fecha, turno_id)
  values (v_ped.sucursal_id, p_pedido, auth.uid(), v_ped.cliente_nombre, v_ped.cliente_id, v_total, v_tasa, v_nota, coalesce(nullif(trim(p_metodo), ''), 'Efectivo'), now(), v_turno) returning id into v_caja;
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
