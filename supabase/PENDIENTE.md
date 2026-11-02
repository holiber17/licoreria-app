# SQL pendiente de cargar en Supabase

Estado al 2 de noviembre de 2026. Todo está probado en un Postgres local con
`npm run test:sql`. El orden importa.

## Ya aplicado en producción

| Archivo | Migración en Supabase |
|---|---|
| `acceso_publico.sql` (fase 1: funciones públicas, columnas `mesa` y `referencia`, restricciones de `pedido_items`, `pedido_ajustes`) | `acceso_publico_fase1` |
| `dinero.sql` (servir, sumar_unidades, cobro con la tasa del día) | `dinero` |

## Falta

1. **`turnos.sql`** — se puede aplicar ya. Es compatible con la versión
   publicada hoy: sin turno abierto se cobra igual. Tiene que estar antes de
   publicar la versión nueva (la pantalla de Caja lo usa).
2. **Publicar la versión Svelte** en Netlify (fusionar los PR a `main`).
3. **`cierre_publico.sql`** — solo después del paso 2. Quita la lectura
   pública directa de pedidos, avisos y sucursales, y hace que la base
   exija "solo el dueño cancela con consumo".
4. Con el paso 3 hecho, se puede borrar de la app el código de
   compatibilidad con la base vieja (`conRpc`, `conMesa`, la mesa dentro
   del nombre y la referencia dentro del método).

## Fuera del SQL (en el panel de Supabase)

- **Authentication → URL Configuration → Redirect URLs:** agregar
  `http://localhost:5173/**` y la dirección de Netlify, para el enlace de
  "¿Olvidaste tu contraseña?".
- **Authentication → SMTP:** el correo integrado solo llega a los miembros
  del equipo del proyecto; para que llegue a los empleados hace falta uno
  propio.
- **Authentication → protección de contraseñas filtradas:** está apagada.
