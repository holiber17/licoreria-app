# SQL pendiente de cargar en Supabase

Estado al 2 de noviembre de 2026. Todo está probado en un Postgres local con
`npm run test:sql`. El orden importa.

## Ya aplicado en producción

| Archivo | Migración en Supabase |
|---|---|
| `acceso_publico.sql` (fase 1: funciones públicas, columnas `mesa` y `referencia`, restricciones de `pedido_items`, `pedido_ajustes`) | `acceso_publico_fase1` |
| `dinero.sql` (servir, sumar_unidades, cobro con la tasa del día) | `dinero` |
| `turnos.sql` (cierre de caja por turno; aplicado el 2 de noviembre de 2026) | `turnos` |
| `cierre_publico.sql` (sin lectura pública directa; solo el dueño cancela con consumo; aplicado el 2 de noviembre de 2026, después de publicar la versión Svelte) | `cierre_publico` |

El código de compatibilidad con la base vieja se quitó de la app: las páginas
públicas solo usan las funciones públicas.

## Falta

1. **`negocios.sql`** — negocios y rol sudo. El dueño pasa a ver solo su
   negocio; el sudo ve todo. Las sucursales existentes quedan en un
   "Negocio principal" y sus dueños, en ese negocio.
2. **En la misma carga, los datos de producción** (no van en el archivo):
   - Hacer sudo a la cuenta del dueño de la plataforma.
   - Crear el negocio de cada cliente y pasarle sus sucursales.
   - Ponerle nombre al "Negocio principal".
3. Publicar la versión de la app que conoce el rol sudo (sin ella, el sudo
   entra como empleado y no ve Admin).

## Fuera del SQL (en el panel de Supabase)

- **Authentication → URL Configuration → Redirect URLs:** agregar
  `http://localhost:5173/**` y la dirección de Netlify, para el enlace de
  "¿Olvidaste tu contraseña?".
- **Authentication → SMTP:** el correo integrado solo llega a los miembros
  del equipo del proyecto; para que llegue a los empleados hace falta uno
  propio.
- **Authentication → protección de contraseñas filtradas:** está apagada.
