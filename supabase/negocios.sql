-- ==========================================================
-- LicoApp — negocios y rol sudo (varios negocios en la misma app)
--
-- Antes el rol "dueño" era global: cualquier dueño veía y cambiaba TODAS las
-- sucursales. Con un segundo negocio (otro cliente) eso le mostraría tus
-- ventas, tu caja y tus clientes. Ahora:
--   sudo      ve y administra todo: crea negocios, mueve sucursales, nombra dueños.
--   dueño     solo su negocio (todas las sucursales de su negocio y su gente).
--   empleado  solo su sucursal, como antes.
--
-- Un negocio agrupa sucursales (sucursales.negocio_id). El dueño pertenece a un
-- negocio (perfiles.negocio_id). Las sucursales que ya existían quedan en un
-- "Negocio principal" y sus dueños, en ese negocio. El sudo se asigna aparte.
--
-- Se puede ejecutar más de una vez.
-- ==========================================================

-- ---------- Tabla y columnas ----------
create table if not exists public.negocios (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table public.sucursales add column if not exists negocio_id uuid references public.negocios(id) on delete set null;
alter table public.perfiles   add column if not exists negocio_id uuid references public.negocios(id) on delete set null;
create index if not exists sucursales_negocio_idx on public.sucursales (negocio_id);

alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('sudo', 'dueno', 'empleado', 'cliente'));

-- ---------- Funciones de permiso ----------
create or replace function privado.es_sudo() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'sudo') $$;

-- El negocio que maneja el usuario si es dueño (null si no lo es)
create or replace function privado.mi_negocio_dueno() returns uuid
language sql stable security definer set search_path = '' as $$
  select negocio_id from public.perfiles where id = auth.uid() and rol = 'dueno' $$;

create or replace function privado.negocio_de(suc uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select negocio_id from public.sucursales where id = suc $$;

-- Sudo, o dueño del negocio de esa sucursal
create or replace function privado.es_dueno_de(suc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_sudo()
      or (privado.mi_negocio_dueno() is not null and privado.mi_negocio_dueno() = privado.negocio_de(suc)) $$;

-- Quien trabaja con esa sucursal: sudo, el dueño de su negocio, o su personal
create or replace function privado.es_personal_de(suc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_dueno_de(suc)
      or exists (select 1 from public.perfiles where id = auth.uid() and rol in ('dueno', 'empleado') and sucursal_id = suc) $$;

-- Sigue existiendo para lo que pregunte "¿es dueño de algo?": dueño o sudo
create or replace function privado.es_dueno() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol in ('dueno', 'sudo')) $$;

-- Sobre qué perfiles puede actuar: el sudo, todos; el dueño, los de su negocio
-- y los pendientes (sin sucursal ni negocio). Nadie más que el sudo ve o toca
-- un perfil sudo, ni puede dejar a alguien en otro negocio.
create or replace function privado.puede_gestionar_perfil(p_rol text, p_sucursal uuid, p_negocio uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select privado.es_sudo() or (
    p_rol is distinct from 'sudo'
    and privado.mi_negocio_dueno() is not null
    and (p_negocio is null or p_negocio = privado.mi_negocio_dueno())
    and (p_sucursal is null or privado.negocio_de(p_sucursal) = privado.mi_negocio_dueno())
  ) $$;

revoke all on function privado.es_sudo() from public, anon;
revoke all on function privado.mi_negocio_dueno() from public, anon;
revoke all on function privado.negocio_de(uuid) from public, anon;
revoke all on function privado.es_dueno_de(uuid) from public, anon;
revoke all on function privado.puede_gestionar_perfil(text, uuid, uuid) from public, anon;
grant execute on function privado.es_sudo(), privado.mi_negocio_dueno(), privado.negocio_de(uuid),
  privado.es_dueno_de(uuid), privado.es_personal_de(uuid), privado.es_dueno(),
  privado.puede_gestionar_perfil(text, uuid, uuid) to authenticated;

-- ---------- Negocios ----------
alter table public.negocios enable row level security;
revoke all on public.negocios from anon;
grant select, insert, update, delete on public.negocios to authenticated;
drop policy if exists "ver negocio" on public.negocios;
create policy "ver negocio" on public.negocios for select to authenticated
  using (privado.es_sudo() or id = privado.mi_negocio_dueno()
         or id = (select privado.negocio_de(sucursal_id) from public.perfiles where id = auth.uid()));
drop policy if exists "sudo gestiona negocios" on public.negocios;
create policy "sudo gestiona negocios" on public.negocios for all to authenticated
  using (privado.es_sudo()) with check (privado.es_sudo());

-- ---------- Sucursales ----------
drop policy if exists "ver sucursales" on public.sucursales;
-- (con el negocio de la propia fila: al crear una sucursal, la fila nueva aún
-- no se ve buscándola por id)
create policy "ver sucursales" on public.sucursales for select to authenticated
  using (privado.es_sudo() or (negocio_id is not null and negocio_id = privado.mi_negocio_dueno())
         or privado.es_personal_de(id));
drop policy if exists "dueno crea sucursales" on public.sucursales;
create policy "dueno crea sucursales" on public.sucursales for insert to authenticated
  with check (privado.es_sudo() or (negocio_id is not null and negocio_id = privado.mi_negocio_dueno()));
drop policy if exists "dueno modifica sucursales" on public.sucursales;
create policy "dueno modifica sucursales" on public.sucursales for update to authenticated
  using (privado.es_dueno_de(id))
  with check (privado.es_sudo() or (negocio_id is not null and negocio_id = privado.mi_negocio_dueno()));
drop policy if exists "dueno borra sucursales" on public.sucursales;
create policy "dueno borra sucursales" on public.sucursales for delete to authenticated
  using (privado.es_dueno_de(id));

-- La sucursal que crea un dueño queda en su negocio
create or replace function privado.sucursal_en_mi_negocio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.negocio_id is null then new.negocio_id := privado.mi_negocio_dueno(); end if;
  return new;
end $$;
drop trigger if exists sucursal_en_mi_negocio on public.sucursales;
create trigger sucursal_en_mi_negocio before insert on public.sucursales
  for each row execute function privado.sucursal_en_mi_negocio();

-- ---------- Perfiles ----------
alter table public.perfiles enable row level security;
drop policy if exists "perfil propio o dueno" on public.perfiles;
create policy "perfil propio o dueno" on public.perfiles for select to authenticated
  using (id = auth.uid() or privado.puede_gestionar_perfil(rol, sucursal_id, negocio_id));
drop policy if exists "dueno gestiona perfiles" on public.perfiles;
create policy "dueno gestiona perfiles" on public.perfiles for update to authenticated
  using (id = auth.uid() or privado.puede_gestionar_perfil(rol, sucursal_id, negocio_id))
  with check (id = auth.uid() or privado.puede_gestionar_perfil(rol, sucursal_id, negocio_id));
drop policy if exists "dueno borra perfiles" on public.perfiles;
create policy "dueno borra perfiles" on public.perfiles for delete to authenticated
  using (id <> auth.uid() and privado.puede_gestionar_perfil(rol, sucursal_id, negocio_id));

-- Un dueño queda en el negocio de su sucursal; un empleado no tiene negocio propio.
-- Sobre su propio perfil nadie cambia rol ni negocio (sí de sucursal: el dueño y
-- el sudo se mueven entre las sucursales que pueden ver).
create or replace function privado.ordenar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id = auth.uid() and tg_op = 'UPDATE' then
    new.rol := old.rol; new.negocio_id := old.negocio_id;
    if old.sucursal_id is not null and new.sucursal_id is null then new.sucursal_id := old.sucursal_id; end if;
    if new.sucursal_id is distinct from old.sucursal_id and not privado.es_personal_de(new.sucursal_id) then
      raise exception 'No puedes cambiarte a esa sucursal' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.rol = 'dueno' and new.negocio_id is null then new.negocio_id := privado.negocio_de(new.sucursal_id); end if;
  if new.rol = 'empleado' then new.negocio_id := null; end if;
  return new;
end $$;
drop trigger if exists ordenar_perfil on public.perfiles;
create trigger ordenar_perfil before insert or update on public.perfiles
  for each row execute function privado.ordenar_perfil();
-- (reemplaza a proteger_perfil_propio, que hacía la primera parte)
drop trigger if exists proteger_perfil_propio on public.perfiles;

-- ---------- Datos del personal: solo su negocio ----------
-- Antes estas reglas decían "o es dueño" (de cualquier negocio)
drop policy if exists "gestionar_caja" on public.caja;
drop policy if exists "ver_caja_sucursal" on public.caja;
create policy "gestionar_caja" on public.caja for all to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

drop policy if exists "gestionar_menu" on public.menu;
drop policy if exists "ver_menu_sucursal" on public.menu;
create policy "gestionar_menu" on public.menu for all to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

drop policy if exists "gestionar_pedidos" on public.pedidos;
drop policy if exists "ver_pedidos_sucursal" on public.pedidos;
create policy "gestionar_pedidos" on public.pedidos for all to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

drop policy if exists "gestionar_items" on public.pedido_items;
drop policy if exists "ver_items_pedido" on public.pedido_items;
create policy "gestionar_items" on public.pedido_items for all to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id and privado.es_personal_de(p.sucursal_id)))
  with check (exists (select 1 from public.pedidos p where p.id = pedido_id and privado.es_personal_de(p.sucursal_id)));

drop policy if exists "personal ve solicitudes" on public.solicitudes;
drop policy if exists "personal atiende solicitudes" on public.solicitudes;
create policy "personal ve solicitudes" on public.solicitudes for select to authenticated
  using (privado.es_personal_de(sucursal_id));
create policy "personal atiende solicitudes" on public.solicitudes for update to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

drop policy if exists "dueno ve ajustes" on public.pedido_ajustes;
create policy "dueno ve ajustes" on public.pedido_ajustes for select to authenticated
  using (privado.es_dueno_de(sucursal_id));

-- Cancelar con consumo: solo el dueño de ESE negocio (o el sudo)
create or replace function privado.cancelar_con_consumo_solo_dueno()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'cancelado'
     and old.estado is distinct from 'cancelado'
     and auth.uid() is not null
     and not privado.es_dueno_de(new.sucursal_id)
     and exists (select 1 from public.pedido_items where pedido_id = new.id and consumido > 0) then
    raise exception 'Solo el dueño puede cancelar un pedido con consumo' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- Lo que ya existía queda en un negocio ----------
do $$
declare n uuid;
begin
  if exists (select 1 from public.sucursales where negocio_id is null) then
    insert into public.negocios (nombre) values ('Negocio principal') returning id into n;
    update public.sucursales set negocio_id = n where negocio_id is null;
  end if;
  update public.perfiles p set negocio_id = s.negocio_id
    from public.sucursales s
   where p.rol = 'dueno' and p.negocio_id is null and s.id = p.sucursal_id;
end $$;
