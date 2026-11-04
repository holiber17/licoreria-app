-- ==========================================================
-- LicorApp — cerrar el menú público directo (fase 2 de menu_publico.sql)
--
-- APLICAR SOLO DESPUÉS de publicar en Netlify la versión de la app que usa
-- menu_publico y pedido_publico.datos_pago. La app anterior lee la tabla
-- menu y los datos de pago de sucursal_publica, y deja de mostrarlos con esto.
--
-- 1) Sin sesión ya no se puede listar la tabla menu (de todos los negocios).
-- 2) sucursal_publica deja de entregar datos_pago.
--
-- Se puede ejecutar más de una vez.
-- ==========================================================

drop policy if exists "menu publico" on public.menu;

create or replace function public.sucursal_publica(p uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'nombre', s.nombre, 'app_nombre', s.app_nombre,
    'logo_url', s.logo_url, 'ciudad', s.ciudad, 'direccion', s.direccion,
    'tasa_actual', privado.tasa_vigente(s.id))
  from public.sucursales s where s.id = p and coalesce(s.activa, true);
$$;
