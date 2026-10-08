-- ==========================================================
-- Protección del perfil propio (aplicado como migración
-- "proteger_perfil_propio").
--
-- Con la sesión vencida, la app leía el perfil, recibía 401 y lo
-- "recreaba" con sucursal vacía: el dueño quedaba pendiente de
-- activación. Además del arreglo en js/auth.js, la base impide
-- que alguien se quite su propia sucursal o se cambie el rol.
-- ==========================================================
create or replace function privado.proteger_perfil_propio()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id = auth.uid() then
    if old.sucursal_id is not null and new.sucursal_id is null then
      new.sucursal_id := old.sucursal_id;
    end if;
    new.rol := old.rol;
  end if;
  return new;
end $$;

create trigger proteger_perfil_propio
  before update on public.perfiles
  for each row execute function privado.proteger_perfil_propio();
