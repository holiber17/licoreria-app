-- ==========================================================
-- LicorApp — acceso público seguro (carta y página del pedido)
--
-- Problema: la carta y la página del pedido leían las tablas directamente
-- sin sesión. RLS no puede decir "solo si conoces el id", así que con la
-- clave pública cualquiera podía LISTAR todos los pedidos con su consumo,
-- los avisos de clientes y los datos de pago de todas las sucursales.
--
-- Arreglo: las páginas públicas usan funciones que devuelven solo el
-- pedido o la sucursal pedidos por id, y se quitan las lecturas directas.
--
-- Va en DOS FASES porque la versión vieja de la app (sin Svelte) todavía
-- lee las tablas directamente:
--   FASE 1: se puede aplicar ya; solo agrega cosas.
--   FASE 2: aplicar DESPUÉS de publicar la versión Svelte.
-- Cada fase se puede ejecutar más de una vez sin romper nada.
-- ==========================================================


-- ================= FASE 1 (solo agrega) =================

-- Columnas de supabase/ajustes_mesonero.sql (la página del pedido muestra la mesa)
alter table public.pedidos
  add column if not exists mesa text check (mesa is null or char_length(mesa) <= 30);
alter table public.solicitudes
  add column if not exists referencia text check (referencia is null or char_length(referencia) <= 20);

-- 1) Un pedido y sus productos, por id. Solo los campos que ve el cliente:
--    sin notas internas, ni quién lo atendió, ni el cliente registrado.
create or replace function public.pedido_publico(p uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pe.id, 'sucursal_id', pe.sucursal_id, 'cliente_nombre', pe.cliente_nombre,
    'mesa', pe.mesa, 'estado', pe.estado, 'tasa_bcv', pe.tasa_bcv, 'created_at', pe.created_at,
    'pedido_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'menu_id', i.menu_id, 'nombre', i.nombre, 'tipo', i.tipo, 'total', i.total,
        'consumido', i.consumido, 'precio_usd', i.precio_usd, 'unidad', i.unidad) order by i.id)
      from public.pedido_items i where i.pedido_id = pe.id), '[]'::jsonb))
  from public.pedidos pe where pe.id = p;
$$;

-- 2) Los últimos avisos de UN pedido (para "Ya vienen")
create or replace function public.avisos_de_pedido(p uuid)
returns table (id uuid, tipo text, estado text, created_at timestamptz, atendida_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.tipo, s.estado, s.created_at, s.atendida_at
  from public.solicitudes s where s.pedido_id = p
  order by s.created_at desc limit 10;
$$;

-- 3) Datos públicos de UNA sucursal (carta y página del pedido)
create or replace function public.sucursal_publica(p uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'nombre', s.nombre, 'app_nombre', s.app_nombre,
    'logo_url', s.logo_url, 'ciudad', s.ciudad, 'direccion', s.direccion, 'datos_pago', s.datos_pago)
  from public.sucursales s where s.id = p and coalesce(s.activa, true);
$$;

-- 4) El cliente avisa "llamar al mesonero" o "quiero pagar".
--    Solo para un pedido abierto, un aviso pendiente por tipo y uno por minuto.
create or replace function public.crear_solicitud(p_pedido uuid, p_tipo text, p_metodo text default null, p_referencia text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_suc uuid; v_id uuid;
begin
  if p_tipo not in ('mesonero', 'pagar') then
    raise exception 'Tipo de aviso inválido' using errcode = 'P0001';
  end if;
  select sucursal_id into v_suc from public.pedidos where id = p_pedido and estado = 'abierto';
  if v_suc is null then
    raise exception 'Este pedido ya no está abierto' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.solicitudes
             where pedido_id = p_pedido and tipo = p_tipo
               and (estado = 'pendiente' or created_at > now() - interval '60 seconds')) then
    raise exception 'Ya avisamos al personal' using errcode = 'P0001';
  end if;
  insert into public.solicitudes (sucursal_id, pedido_id, tipo, metodo, referencia)
  values (v_suc, p_pedido, p_tipo,
          nullif(left(btrim(coalesce(p_metodo, '')), 40), ''),
          nullif(left(regexp_replace(coalesce(p_referencia, ''), '[^A-Za-z0-9-]', '', 'g'), 20), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.pedido_publico(uuid) from public;
revoke all on function public.avisos_de_pedido(uuid) from public;
revoke all on function public.sucursal_publica(uuid) from public;
revoke all on function public.crear_solicitud(uuid, text, text, text) from public;
grant execute on function public.pedido_publico(uuid) to anon, authenticated;
grant execute on function public.avisos_de_pedido(uuid) to anon, authenticated;
grant execute on function public.sucursal_publica(uuid) to anon, authenticated;
grant execute on function public.crear_solicitud(uuid, text, text, text) to anon, authenticated;

-- 5) Productos del pedido: nada de precios negativos ni consumo fuera de rango
--    (antes un empleado podía agregar un "producto" a -20 $ y cobrar de menos).
--    Hoy no hay filas que lo incumplan.
alter table public.pedido_items drop constraint if exists pedido_items_valores_validos;
alter table public.pedido_items add constraint pedido_items_valores_validos
  check (precio_usd >= 0 and total >= 0 and consumido >= 0 and consumido <= total);

-- 6) Registro de lo que se quita o se baja después de servido, con quién lo
--    hizo. Corregir un error sigue permitido; queda constancia para el dueño.
create table if not exists public.pedido_ajustes (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  usuario_id  uuid references auth.users(id),
  nombre      text not null,
  servido_antes   integer not null,
  servido_despues integer not null,
  monto_usd   numeric not null,
  created_at  timestamptz not null default now()
);
create index if not exists pedido_ajustes_sucursal_idx on public.pedido_ajustes (sucursal_id, created_at desc);
alter table public.pedido_ajustes enable row level security;
drop policy if exists "dueno ve ajustes" on public.pedido_ajustes;
create policy "dueno ve ajustes" on public.pedido_ajustes
  for select to authenticated using (privado.es_dueno());

create or replace function privado.registrar_ajuste()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_antes integer := old.consumido;
        v_despues integer := case when tg_op = 'DELETE' then 0 else new.consumido end;
        v_suc uuid;
begin
  select sucursal_id into v_suc from public.pedidos where id = old.pedido_id;
  -- Sin pedido: se está borrando el pedido entero (cascada); no hay nada que registrar
  if v_despues < v_antes and v_suc is not null then
    insert into public.pedido_ajustes (pedido_id, sucursal_id, usuario_id, nombre, servido_antes, servido_despues, monto_usd)
    values (old.pedido_id, v_suc, auth.uid(), old.nombre, v_antes, v_despues, (v_antes - v_despues) * old.precio_usd);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists registrar_ajuste on public.pedido_items;
create trigger registrar_ajuste
  after update of consumido or delete on public.pedido_items
  for each row execute function privado.registrar_ajuste();


-- ================= FASE 2 (después de publicar la versión Svelte) =================
-- Quita las lecturas y escrituras directas sin sesión.
-- La versión vieja de la página del pedido y de la carta deja de funcionar.

-- drop policy if exists "ver_pedido_publico" on public.pedidos;
-- drop policy if exists "ver_items_publico" on public.pedido_items;
-- drop policy if exists "cliente ve estado de avisos recientes" on public.solicitudes;
-- drop policy if exists "cliente crea solicitud" on public.solicitudes;
-- drop policy if exists "sucursal publica" on public.sucursales;
--
-- Y el trigger "solo el dueño cancela con consumo" (supabase/ajustes_mesonero.sql, punto 3).
