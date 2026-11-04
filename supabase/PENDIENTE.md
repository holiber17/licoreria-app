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
| `dinero_seguro.sql` (caja solo lectura, pedidos sin borrar ni reabrir, un cobro por pedido, tope de tasa, método de pago; aplicado el 3 de noviembre de 2026) | `dinero_seguro` |

El código de compatibilidad con la base vieja se quitó de la app: las páginas
públicas solo usan las funciones públicas.

## Falta

Nada de SQL por ahora. Siguen fuera de lo aplicado (ver la inspección de noviembre de 2026):
menú público por función, pendientes globales, presencia y restricciones menores.

## Fuera del SQL (en el panel de Supabase)

- **Authentication → URL Configuration → Redirect URLs:** agregar
  `http://localhost:5173/**` y la dirección de Netlify, para el enlace de
  "¿Olvidaste tu contraseña?".
- **Authentication → SMTP:** el correo integrado solo llega a los miembros
  del equipo del proyecto; para que llegue a los empleados hace falta uno
  propio.
- **Authentication → protección de contraseñas filtradas:** está apagada.
