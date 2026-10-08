-- ==========================================================
-- LicorApp — tiempo real
-- Aplicado en Supabase como migración "tiempo_real".
--
-- Conecta pedidos, productos del pedido y avisos al tiempo real de
-- Supabase: el personal recibe los avisos al instante y el cliente ve
-- su cuenta actualizada sin esperar. El tiempo real respeta RLS.
-- ==========================================================

alter publication supabase_realtime add table public.pedidos, public.pedido_items, public.solicitudes;

-- La página del cliente (sin sesión) necesita ver si su aviso ya fue
-- atendido para mostrar "Ya vienen". Solo avisos de las últimas 12 horas;
-- no tienen datos personales (tipo, estado, pedido y hora).
create policy "cliente ve estado de avisos recientes" on public.solicitudes
  for select to anon
  using (created_at > now() - interval '12 hours');
