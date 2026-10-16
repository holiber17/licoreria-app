// Avisos de los clientes (desde la página del QR): "Llamar al mesonero" y "Quiero pagar".
// Necesita la tabla `solicitudes` (supabase/cliente.sql).
import { sb, LOGO_URL } from '../lib/config.js';
import { rest, restPatch } from '../lib/api.js';
import { e } from '../lib/estado.svelte.js';
import { sonidoAlerta, feedback } from '../lib/sonidos.js';
import { toastAlerta, showToast, esc } from '../lib/avisos.svelte.js';
import { hace } from '../lib/catalogo.js';
import { puedeNotificar } from './notificaciones.js';

export const SOL_TIPOS = {
  mesonero: { icono: 'ti-bell-ringing', texto: 'Llama al mesonero' },
  pagar: { icono: 'ti-wallet', texto: 'Quiere pagar' },
};

let vistas = new Set();
let activas = true;   // se apaga si la tabla aún no existe
let primera = true;
let timer = null;
let canal = null;
let tiempoRealActivo = false;
let vueltas = 0;

// Tiempo real: los avisos y los pedidos nuevos llegan al instante.
// Respaldo: si el tiempo real no conecta, se consulta cada 15 s
// (y cada 60 s aunque esté conectado, por si se perdió algún evento).
export function iniciarSolicitudes() {
  if (timer) return;
  cargarSolicitudes();
  iniciarTiempoReal();
  timer = setInterval(() => {
    vueltas++;
    if (!tiempoRealActivo || vueltas % 4 === 0) cargarSolicitudes();
  }, 15000);
}

export function detenerSolicitudes() {
  clearInterval(timer); timer = null;
  if (canal) { sb.removeChannel(canal); canal = null; }
  tiempoRealActivo = false;
}

function iniciarTiempoReal() {
  if (!e.sucursal || !sb.channel) return;
  if (canal) { sb.removeChannel(canal); canal = null; tiempoRealActivo = false; }
  const f = 'sucursal_id=eq.' + e.sucursal.id;
  let t = null;
  const refrescarPedidos = () => { clearTimeout(t); t = setTimeout(() => { e.versionPedidos++; }, 300); };
  try {
    canal = sb.channel('sucursal-' + e.sucursal.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes', filter: f }, () => cargarSolicitudes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: f }, refrescarPedidos)
      .subscribe(estado => { tiempoRealActivo = estado === 'SUBSCRIBED'; });
  } catch (err) { tiempoRealActivo = false; }
}

// Al cambiar de sucursal
export function reiniciarSolicitudes() {
  e.solicitudes = []; vistas = new Set(); primera = true;
  cargarSolicitudes(); iniciarTiempoReal();
}

export async function cargarSolicitudes() {
  if (!activas || !e.sucursal) return;
  let r;
  try { r = await rest('solicitudes?select=*,pedidos(cliente_nombre)&sucursal_id=eq.' + e.sucursal.id + '&estado=eq.pendiente&order=created_at.asc'); }
  catch (err) { return; }
  // 404/400: la tabla todavía no se creó en Supabase. No insistir.
  if (r.status === 404 || r.status === 400) { activas = false; e.solicitudes = []; return; }
  if (!r.ok) return;
  const lista = await r.json();
  const nuevas = lista.filter(s => !vistas.has(s.id));
  nuevas.forEach(s => vistas.add(s.id));
  if (nuevas.length && !primera) avisar(nuevas);
  primera = false;
  e.solicitudes = lista;
}

function avisar(nuevas) {
  sonidoAlerta();
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  const s = nuevas[nuevas.length - 1];
  const t = SOL_TIPOS[s.tipo] || SOL_TIPOS.mesonero;
  const quien = s.pedidos?.cliente_nombre || 'Un cliente';
  toastAlerta(`<strong>${esc(quien)}</strong><br>${t.texto}${s.metodo ? ' · ' + esc(s.metodo) : ''}${nuevas.length > 1 ? `<br><span class="t-mini">y ${nuevas.length - 1} aviso(s) más</span>` : ''}`, 7000);
  if (puedeNotificar()) {
    new Notification((s.tipo === 'pagar' ? '💳 ' : '🔔 ') + quien, { body: t.texto + (s.metodo ? ' · ' + s.metodo : ''), icon: LOGO_URL, tag: 'sol_' + s.id });
  }
}

export async function atenderSolicitud(id) {
  const r = await restPatch('solicitudes', id, { estado: 'atendida', atendida_at: new Date().toISOString(), atendida_por: e.user.id });
  if (!r.ok) { showToast('No se pudo marcar como atendido', 'danger'); return; }
  e.solicitudes = e.solicitudes.filter(s => s.id !== id);
  feedback();
}

// Tipos de aviso pendientes de un pedido (para marcar su tarjeta)
export const avisosDePedido = pedidoId => [...new Set(e.solicitudes.filter(s => s.pedido_id === pedidoId).map(s => s.tipo))];
export { hace };

// Gancho para las pruebas automáticas
if (typeof window !== 'undefined') window.__licor = { ...(window.__licor || {}), cargarSolicitudes };
