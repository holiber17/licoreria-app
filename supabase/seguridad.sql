-- ==========================================================
-- LicorApp — permisos seguros (RLS)
-- Antes, perfiles, clientes, inventario, inventario_movimientos y
-- tasas_bcv se podían leer y modificar SIN sesión con la clave pública,
-- y cualquier usuario con sesión podía modificar sucursales.
--
-- Las reglas abiertas no se borran: se desactivan (quedan solo para
-- service_role, que de todas formas se salta RLS) y se renombran a
-- "obsoleta_...". Se pueden borrar luego desde el panel de Supabase.
-- Aplicado en Supabase como migración "permisos_seguros".
-- ==========================================================

-- ---------- Funciones de apoyo (fuera del esquema público) ----------
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

-- ¿El usuario actual es dueño?
create or replace function privado.es_dueno()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'dueno');
$$;

-- ¿El usuario actual trabaja en esa sucursal (o es dueño)?
create or replace function privado.es_personal_de(suc uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid()
      and (rol = 'dueno' or (rol = 'empleado' and sucursal_id = suc))
  );
$$;

revoke all on function privado.es_dueno() from public, anon;
revoke all on function privado.es_personal_de(uuid) from public, anon;
grant execute on function privado.es_dueno() to authenticated;
grant execute on function privado.es_personal_de(uuid) to authenticated;

-- ---------- Perfil automático al registrarse ----------
-- Así el registro ya no depende de que perfiles esté abierta.
create or replace function privado.crear_perfil()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, rol, sucursal_id)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), new.email), 'empleado', null)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function privado.crear_perfil();

-- ---------- perfiles ----------
alter policy "perfiles_policy" on public.perfiles to service_role;
alter policy "perfiles_policy" on public.perfiles rename to "obsoleta_perfiles_policy";
create policy "perfil propio o dueno" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or privado.es_dueno());
create policy "crear perfil propio" on public.perfiles
  for insert to authenticated
  with check (id = auth.uid() and rol = 'empleado' and sucursal_id is null);
create policy "dueno gestiona perfiles" on public.perfiles
  for update to authenticated
  using (privado.es_dueno()) with check (privado.es_dueno());
create policy "dueno borra perfiles" on public.perfiles
  for delete to authenticated
  using (privado.es_dueno());

-- ---------- clientes, inventario, movimientos y tasas ----------
alter policy "clientes_policy" on public.clientes to service_role;
alter policy "clientes_policy" on public.clientes rename to "obsoleta_clientes_policy";
create policy "personal de la sucursal" on public.clientes
  for all to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

alter policy "inventario_policy" on public.inventario to service_role;
alter policy "inventario_policy" on public.inventario rename to "obsoleta_inventario_policy";
create policy "personal de la sucursal" on public.inventario
  for all to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

alter policy "movimientos_policy" on public.inventario_movimientos to service_role;
alter policy "movimientos_policy" on public.inventario_movimientos rename to "obsoleta_movimientos_policy";
create policy "personal de la sucursal" on public.inventario_movimientos
  for all to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

alter policy "tasas_policy" on public.tasas_bcv to service_role;
alter policy "tasas_policy" on public.tasas_bcv rename to "obsoleta_tasas_policy";
create policy "personal de la sucursal" on public.tasas_bcv
  for all to authenticated
  using (privado.es_personal_de(sucursal_id)) with check (privado.es_personal_de(sucursal_id));

-- ---------- sucursales ----------
-- Lectura: cualquiera (ya existe "sucursal publica" para anon) y el personal.
-- Crear, modificar o borrar: solo el dueño.
alter policy "sucursales_auth" on public.sucursales to service_role;
alter policy "sucursales_auth" on public.sucursales rename to "obsoleta_sucursales_auth";
create policy "ver sucursales" on public.sucursales
  for select to authenticated using (true);
create policy "dueno crea sucursales" on public.sucursales
  for insert to authenticated with check (privado.es_dueno());
create policy "dueno modifica sucursales" on public.sucursales
  for update to authenticated using (privado.es_dueno()) with check (privado.es_dueno());
create policy "dueno borra sucursales" on public.sucursales
  for delete to authenticated using (privado.es_dueno());
