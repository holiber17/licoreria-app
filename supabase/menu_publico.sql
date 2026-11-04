-- ==========================================================
-- LicorApp — menú público por función (fase 1; solo agrega, compatible con la app vieja)
--
-- Problema: la política "menu publico" deja a cualquiera, sin sesión, listar
-- los productos de todos los negocios, y sucursal_publica entrega los datos
-- de pago (cuentas, teléfonos, cédulas) con solo conocer el id de una sucursal.
--
-- Esta fase:
--  1) menu_publico(p): solo los productos ACTIVOS de UNA sucursal activa.
--  2) pedido_publico(p): agrega datos_pago, y solo mientras el pedido está
--     abierto (los datos de pago ya no se ven con el id de la sucursal, sino
--     con el enlace de un pedido abierto).
--
-- Orden de despliegue:
--   a) aplicar este archivo
--   b) publicar la app en Netlify (usa menu_publico y pedido_publico.datos_pago)
--   c) aplicar menu_publico_cierre.sql
--
-- Se puede ejecutar más de una vez.
-- ==========================================================

create or replace function public.menu_publico(p uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'nombre', m.nombre, 'tipo', m.tipo, 'precio_usd', m.precio_usd,
      'unidad', m.unidad, 'categoria', m.categoria, 'unidades_combo', m.unidades_combo,
      'imagen_url', m.imagen_url) order by m.categoria, m.nombre), '[]'::jsonb)
  from public.menu m
  join public.sucursales s on s.id = m.sucursal_id and coalesce(s.activa, true)
  where m.sucursal_id = p and m.activo = true;
$$;

create or replace function public.pedido_publico(p uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pe.id, 'sucursal_id', pe.sucursal_id, 'cliente_nombre', pe.cliente_nombre,
    'mesa', pe.mesa, 'estado', pe.estado, 'tasa_bcv', pe.tasa_bcv, 'created_at', pe.created_at,
    'tasa_actual', privado.tasa_vigente(pe.sucursal_id),
    'datos_pago', case when pe.estado = 'abierto'
      then (select s.datos_pago from public.sucursales s where s.id = pe.sucursal_id) end,
    'pedido_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'menu_id', i.menu_id, 'nombre', i.nombre, 'tipo', i.tipo, 'total', i.total,
        'consumido', i.consumido, 'precio_usd', i.precio_usd, 'unidad', i.unidad) order by i.id)
      from public.pedido_items i where i.pedido_id = pe.id), '[]'::jsonb))
  from public.pedidos pe where pe.id = p;
$$;

revoke all on function public.menu_publico(uuid) from public;
revoke all on function public.pedido_publico(uuid) from public;
grant execute on function public.menu_publico(uuid) to anon, authenticated;
grant execute on function public.pedido_publico(uuid) to anon, authenticated;
