# SQL pendiente de cargar en Supabase

Estado al 3 de noviembre de 2026. Todo está probado en un Postgres local con
`npm run test:sql`. El orden importa.

## Ya aplicado en producción

| Archivo | Migración en Supabase |
|---|---|
| `acceso_publico.sql` (fase 1: funciones públicas, columnas `mesa` y `referencia`, restricciones de `pedido_items`, `pedido_ajustes`) | `acceso_publico_fase1` |
| `dinero.sql` (servir, sumar_unidades, cobro con la tasa del día) | `dinero` |
| `turnos.sql` (cierre de caja por turno; aplicado el 2 de noviembre de 2026) | `turnos` |
| `cierre_publico.sql` (sin lectura pública directa; solo el dueño cancela con consumo; aplicado el 2 de noviembre de 2026, después de publicar la versión Svelte) | `cierre_publico` |
| `negocios.sql` (negocios y rol sudo; el dueño ve solo su negocio) | `negocios_sudo` |
| `menu_publico.sql` (fase 1: `menu_publico(p)` y `datos_pago` solo con el pedido abierto; aplicado el 3 de noviembre de 2026) | `menu_publico` |
| `menu_publico_cierre.sql` (fase 2: sin lectura pública de `menu` ni `datos_pago` en `sucursal_publica`; aplicado el 3 de noviembre de 2026, después de publicar la app) | `menu_publico_cierre` |

El código de compatibilidad con la base vieja se quitó de la app: las páginas
públicas solo usan las funciones públicas.

## Falta

1. **`restricciones_menores.sql`** — inspección de noviembre de 2026 (prioridad 1, ítem 6).
   No necesita cambios en la app. Se revisó en producción que ninguna fila incumple.
   - `pedido_items`: `total`, `consumido`, `precio_usd` y `unidad` sin NULL.
   - Un cobro solo puede usar un turno de su misma sucursal.
   - Sin NaN en turnos, caja, líneas de pedido y tasas.
   - Borrar una sucursal con historial se rechaza (antes borraba pedidos, cobros,
     turnos y ajustes en cascada). Para retirarla, `activa = false`.

Siguen fuera de lo aplicado: pendientes globales y presencia.

## Fuera del SQL (en el panel de Supabase)

- **Authentication → URL Configuration → Redirect URLs:** agregar
  `http://localhost:5173/**` y la dirección de Netlify, para el enlace de
  "¿Olvidaste tu contraseña?".
- **Authentication → SMTP:** el correo integrado solo llega a los miembros
  del equipo del proyecto; para que llegue a los empleados hace falta uno
  propio.
- **Authentication → protección de contraseñas filtradas:** está apagada.
