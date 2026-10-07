-- ==========================================================
-- LicorApp — funciones para el cliente
-- Pegar completo en Supabase > SQL Editor > Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- ==========================================================

-- 1) Datos de pago del negocio (Pago móvil, Zelle, transferencia)
alter table public.sucursales
  add column if not exists datos_pago jsonb not null default '{}'::jsonb;

-- 2) Solicitudes que hace el cliente desde la página del QR
create table if not exists public.solicitudes (
  id          uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  tipo        text not null check (tipo in ('mesonero','pagar')),
  metodo      text check (metodo is null or char_length(metodo) <= 40),
  estado      text not null default 'pendiente' check (estado in ('pendiente','atendida')),
  created_at  timestamptz not null default now(),
  atendida_at timestamptz,
  atendida_por uuid references auth.users(id)
);
create index if not exists solicitudes_pendientes_idx
  on public.solicitudes (sucursal_id, estado, created_at desc);

alter table public.solicitudes enable row level security;

-- El cliente (sin sesión) solo puede CREAR solicitudes pendientes
-- y solo para un pedido que siga abierto en esa misma sucursal.
-- No puede leer, cambiar ni borrar nada.
drop policy if exists "cliente crea solicitud" on public.solicitudes;
create policy "cliente crea solicitud" on public.solicitudes
  for insert to anon, authenticated
  with check (
    estado = 'pendiente'
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_id
        and p.sucursal_id = solicitudes.sucursal_id
        and p.estado = 'abierto'
    )
  );

-- El personal ve y atiende las solicitudes de su sucursal (el dueño, todas).
drop policy if exists "personal ve solicitudes" on public.solicitudes;
create policy "personal ve solicitudes" on public.solicitudes
  for select to authenticated
  using (
    exists (
      select 1 from public.perfiles pf
      where pf.id = auth.uid()
        and (pf.rol = 'dueno' or pf.sucursal_id = solicitudes.sucursal_id)
    )
  );

drop policy if exists "personal atiende solicitudes" on public.solicitudes;
create policy "personal atiende solicitudes" on public.solicitudes
  for update to authenticated
  using (
    exists (
      select 1 from public.perfiles pf
      where pf.id = auth.uid()
        and (pf.rol = 'dueno' or pf.sucursal_id = solicitudes.sucursal_id)
    )
  );

-- 3) Menú público: cualquiera puede ver los productos ACTIVOS.
--    (Si tu tabla menu ya permitía lectura pública, esto no cambia nada.)
drop policy if exists "menu publico" on public.menu;
create policy "menu publico" on public.menu
  for select to anon
  using (activo = true);

-- 4) Datos públicos del negocio (nombre, logo, dirección y datos de pago)
--    para la carta y la página del pedido. Solo lectura.
drop policy if exists "sucursal publica" on public.sucursales;
create policy "sucursal publica" on public.sucursales
  for select to anon
  using (true);

-- 5) OPCIONAL: marcar "Agotado" en el menú público.
--    Ojo: deja ver el stock de cada producto a cualquiera con el enlace.
--    Si te parece bien, quita los dos guiones de las 3 líneas siguientes.
-- create policy "stock publico" on public.inventario
--   for select to anon
--   using (true);
