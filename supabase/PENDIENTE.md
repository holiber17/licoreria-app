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

El código de compatibilidad con la base vieja se quitó de la app: las páginas
públicas solo usan las funciones públicas.

## Falta

1. **`menu_publico.sql`** (fase 1) — inspección de noviembre de 2026. Solo agrega:
   `menu_publico(p)` (productos activos de una sucursal) y `datos_pago` dentro de
   `pedido_publico(p)`, solo con el pedido abierto. Compatible con la app actual.
2. Publicar en Netlify la app que usa esas funciones (`Carta.svelte`, `PedidoCliente.svelte`).
3. **`menu_publico_cierre.sql`** (fase 2) — solo DESPUÉS del paso 2: quita la política
   `"menu publico"` (nadie sin sesión lista las tablas de menú) y saca `datos_pago`
   de `sucursal_publica`. Con la app anterior, la carta y los métodos de pago
   dejan de verse.

## Fuera del SQL (en el panel de Supabase)

- **Authentication → URL Configuration → Redirect URLs:** agregar
  `http://localhost:5173/**` y la dirección de Netlify, para el enlace de
  "¿Olvidaste tu contraseña?".
- **Authentication → SMTP:** el correo integrado solo llega a los miembros
  del equipo del proyecto; para que llegue a los empleados hace falta uno
  propio.
- **Authentication → protección de contraseñas filtradas:** está apagada.
