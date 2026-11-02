-- ==========================================================
-- LicorApp — mesa por separado, referencia de pago y cancelar con consumo
-- Pegar completo en Supabase > SQL Editor > Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- La app ya funciona sin esto (guarda la mesa dentro del nombre y la
-- referencia dentro del método); al correrlo quedan en columnas propias.
-- ==========================================================

-- 1) Mesa del pedido, separada del nombre del cliente
alter table public.pedidos
  add column if not exists mesa text
  check (mesa is null or char_length(mesa) <= 30);

-- 2) Referencia que el cliente escribe al avisar su pago
alter table public.solicitudes
  add column if not exists referencia text
  check (referencia is null or char_length(referencia) <= 20);

-- 3) Un pedido con consumo servido solo lo puede cancelar el dueño.
--    (Cobrarlo sí lo puede hacer cualquier empleado de la sucursal.)
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
