-- ==========================================================
-- LicorApp — restricciones menores (inspección de noviembre de 2026, prioridad 1, ítem 6)
--
-- 1) pedido_items: total, consumido, precio_usd y unidad dejan de aceptar NULL
--    (un NULL en consumido o precio_usd rompía los totales en silencio).
-- 2) Un cobro solo puede apuntar a un turno de SU sucursal (clave compuesta).
-- 3) Sin NaN en el dinero: numeric acepta 'NaN' y 'NaN' pasa "x >= 0"
--    (en Postgres NaN es mayor que todo número), así que se prohíbe aparte.
-- 4) Borrar una sucursal ya no borra su historial: pedidos, cobros, turnos y
--    ajustes pasan de ON DELETE CASCADE a RESTRICT. Una sucursal con historial
--    se desactiva (activa = false), no se borra.
--
-- Antes de aplicar se revisó en producción que ninguna fila incumple
-- (3 de noviembre de 2026). No necesita cambios en la app.
-- Requiere turnos.sql. Se puede ejecutar más de una vez.
-- ==========================================================

-- 1) NOT NULL (todas ya tienen valor por defecto)
alter table public.pedido_items alter column total set not null;
alter table public.pedido_items alter column consumido set not null;
alter table public.pedido_items alter column precio_usd set not null;
alter table public.pedido_items alter column unidad set not null;

-- 2) Turno de otra sucursal: caja(turno_id, sucursal_id) -> turnos(id, sucursal_id).
--    Con turno_id vacío (cobro sin turno abierto) la clave no se evalúa.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.turnos'::regclass and conname = 'turnos_id_sucursal_key') then
    alter table public.turnos add constraint turnos_id_sucursal_key unique (id, sucursal_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.caja'::regclass and conname = 'caja_turno_sucursal_fkey') then
    alter table public.caja add constraint caja_turno_sucursal_fkey
      foreign key (turno_id, sucursal_id) references public.turnos (id, sucursal_id);
  end if;
end $$;
alter table public.caja drop constraint if exists caja_turno_id_fkey;

-- 3) Sin NaN
do $$
declare r record;
begin
  for r in select * from (values
    ('turnos', 'turnos_fondo_usd_finito', 'fondo_usd <> ''NaN'''),
    ('turnos', 'turnos_fondo_bs_finito', 'fondo_bs <> ''NaN'''),
    ('turnos', 'turnos_diferencia_finita', 'diferencia_usd <> ''NaN'''),
    ('turnos', 'turnos_tasa_cierre_finita', 'tasa_cierre <> ''NaN'''),
    ('caja', 'caja_total_finito', 'total_usd <> ''NaN'''),
    ('caja', 'caja_tasa_finita', 'tasa_bcv <> ''NaN'''),
    ('pedido_items', 'pedido_items_precio_finito', 'precio_usd <> ''NaN'''),
    ('tasas_bcv', 'tasas_bcv_tasa_finita', 'tasa <> ''NaN''')
  ) as t(tabla, nombre, regla)
  loop
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || r.tabla)::regclass and conname = r.nombre) then
      execute format('alter table public.%I add constraint %I check (%s)', r.tabla, r.nombre, r.regla);
    end if;
  end loop;
end $$;

-- 4) El historial no se borra con la sucursal
do $$
declare r record;
begin
  for r in select * from (values
    ('pedidos', 'pedidos_sucursal_id_fkey'),
    ('caja', 'caja_sucursal_id_fkey'),
    ('turnos', 'turnos_sucursal_id_fkey'),
    ('pedido_ajustes', 'pedido_ajustes_sucursal_id_fkey')
  ) as t(tabla, nombre)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tabla, r.nombre);
    execute format('alter table public.%I add constraint %I foreign key (sucursal_id) references public.sucursales(id) on delete restrict', r.tabla, r.nombre);
  end loop;
end $$;
