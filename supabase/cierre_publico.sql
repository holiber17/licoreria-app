-- ==========================================================
-- LicorApp — cerrar el acceso público directo (fase 2 de acceso_publico.sql)
--
-- APLICAR SOLO DESPUÉS de publicar la versión Svelte en Netlify.
-- La versión vieja de la carta y de la página del pedido lee las tablas
-- directamente y deja de funcionar con esto.
--
-- 1) Sin sesión ya no se pueden listar pedidos, productos del pedido, avisos
--    ni sucursales (con los datos de pago). Las páginas públicas usan
--    pedido_publico, avisos_de_pedido, sucursal_publica y crear_solicitud.
-- 2) Un pedido con consumo servido solo lo cancela el dueño, también en la
--    base (antes solo lo impedía la app).
--
-- Se puede ejecutar más de una vez.
-- ==========================================================

drop policy if exists "ver_pedido_publico" on public.pedidos;
drop policy if exists "ver_items_publico" on public.pedido_items;
drop policy if exists "cliente ve estado de avisos recientes" on public.solicitudes;
drop policy if exists "cliente crea solicitud" on public.solicitudes;
drop policy if exists "sucursal publica" on public.sucursales;

create or replace function privado.cancelar_con_consumo_solo_dueno()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'cancelado'
     and old.estado is distinct from 'cancelado'
     and auth.uid() is not null
     and not privado.es_dueno()
     and exists (select 1 from public.pedido_items
                 where pedido_id = new.id and consumido > 0) then
    raise exception 'Solo el dueño puede cancelar un pedido con consumo' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists cancelar_con_consumo on public.pedidos;
create trigger cancelar_con_consumo
  before update on public.pedidos
  for each row execute function privado.cancelar_con_consumo_solo_dueno();
