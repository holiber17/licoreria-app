-- ==========================================================
-- LicorApp — presencia en canales privados (inspección de noviembre de 2026, prioridad 1, ítem 5)
--
-- "Quién tiene la app abierta" usa canales de presencia de Supabase Realtime.
-- Eran públicos: quien conociera el id de un negocio (y la clave pública de la
-- app) podía escuchar nombres y sucursales de su personal, y todos los usuarios
-- sin negocio compartían el canal "presencia-sin-negocio".
--
-- Esta fase (compatible con la app vieja: los canales públicos no usan estas
-- políticas): reglas de acceso para los canales PRIVADOS.
--   presencia-<negocio>      sudo, o quien trabaja en una sucursal de ese negocio,
--                            o el dueño de ese negocio
--   presencia-suc-<sucursal> (sucursal sin negocio) quien trabaja en ella
-- Cualquier otro tema privado queda sin acceso.
--
-- Orden de despliegue:
--   a) aplicar este archivo
--   b) publicar la app (abre los canales con private: true)
--   c) en el panel: Realtime → Settings → desactivar "Allow public access"
--      (así ya nadie puede abrir canales públicos)
--
-- Se puede ejecutar más de una vez.
-- ==========================================================

create or replace function privado.puede_presencia(tema text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if tema ~ '^presencia-suc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return privado.es_personal_de(substr(tema, 15)::uuid);
  elsif tema ~ '^presencia-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := substr(tema, 11)::uuid;
    return privado.es_sudo()
      or exists (select 1 from public.perfiles p
                 where p.id = auth.uid()
                   and ((p.rol = 'dueno' and p.negocio_id = v_id)
                        or privado.negocio_de(p.sucursal_id) = v_id));
  end if;
  return false;
end $$;
revoke all on function privado.puede_presencia(text) from public, anon;
grant execute on function privado.puede_presencia(text) to authenticated;

drop policy if exists "presencia: recibir" on realtime.messages;
create policy "presencia: recibir" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'presence' and privado.puede_presencia(realtime.topic()));

drop policy if exists "presencia: anunciarse" on realtime.messages;
create policy "presencia: anunciarse" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'presence' and privado.puede_presencia(realtime.topic()));
