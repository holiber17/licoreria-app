// Pedidos abiertos: lista, pedido en pantalla, consumo y cobro
import { sb } from '../lib/config.js';
import { restGet, restPatch } from '../lib/api.js';
import { e } from '../lib/estado.svelte.js';
import { feedback, sonidoCaja, vibrate } from '../lib/sonidos.js';
import { showToast, enCurso } from '../lib/avisos.svelte.js';
import { msgError, plural } from '../lib/catalogo.js';
import { fmtUSD, totalDe } from '../lib/formato.svelte.js';
import { checkNotificaciones } from './notificaciones.js';

export const ped = $state({
  actual: null,        // pedido abierto en pantalla (con pedido_items)
  lista: [],           // pedidos activos de la sucursal
  tab: 'consumo',      // consumo | agregar | cuenta
  seleccion: {},       // menu_id -> cantidad (productos tocados, aún sin agregar)
  metodo: '',          // método de pago elegido en la hoja de cobro
  cobroAbierto: false,
});

const items = () => ped.actual?.pedido_items || [];

// ---- LISTA ----
export async function cargarLista() {
  if (!e.sucursal) return;
  const data = await restGet('pedidos?select=*,pedido_items(*)&sucursal_id=eq.' + e.sucursal.id + '&estado=eq.abierto&order=created_at.desc');
  ped.lista = data || [];
}

export async function crearPedido(nombre) {
  const { data, error } = await sb.from('pedidos').insert({ sucursal_id: e.sucursal.id, usuario_id: e.user.id, cliente_nombre: nombre, estado: 'abierto', tasa_bcv: e.tasaBCV }).select().single();
  if (error) { showToast('Error al crear pedido', 'danger'); return false; }
  await abrirPedido(data.id);
  return true;
}

export async function abrirPedido(id) {
  ped.seleccion = {};
  const { data } = await sb.from('pedidos').select('*,pedido_items(*)').eq('id', id).single();
  if (!data) return;
  ped.actual = data;
  ped.tab = 'consumo';
}

export function volverALista() { ped.actual = null; ped.seleccion = {}; cargarLista(); }

export async function cancelarPedido() {
  if (!ped.actual) return;
  if (!confirm('¿Cancelar el pedido sin cobrar?')) return;
  await sb.from('pedidos').update({ estado: 'cancelado' }).eq('id', ped.actual.id);
  volverALista();
}

// ---- COBRO ----
// Hay que elegir el método de pago antes de confirmar. El cobro ocurre entero
// dentro de Supabase (función cobrar_pedido): cierra el pedido, registra en caja y
// descuenta el stock en una sola operación. Si se toca dos veces, la segunda falla
// con "ya fue cobrado".
export function abrirCobro() {
  if (!ped.actual) return;
  if (!items().filter(i => i.consumido > 0).length) { showToast('No hay nada servido para cobrar', 'danger'); return; }
  ped.metodo = '';
  ped.cobroAbierto = true;
}
export function cerrarCobro() { ped.cobroAbierto = false; }

export async function cobrarPedido(nota) {
  if (!ped.actual || !ped.metodo) return;
  const total = totalDe(items().filter(i => i.consumido > 0));
  const metodo = ped.metodo;
  await enCurso('cobrar', async () => {
    const { data, error } = await sb.rpc('cobrar_pedido', { p_pedido: ped.actual.id, p_metodo: metodo, p_nota: nota, p_tasa: e.tasaBCV });
    if (error) {
      showToast(msgError(error, 'No se pudo cobrar. Intenta de nuevo.'), 'danger');
      // Si ya estaba cobrado (p. ej. desde otro teléfono), volver a la lista
      if (/ya fue cobrado/i.test(error.message || '')) { cerrarCobro(); volverALista(); }
      return;
    }
    cerrarCobro();
    sonidoCaja(); showToast(`Cobrado ${fmtUSD(data?.total_usd ?? total)} · ${metodo} ✓`);
    volverALista(); e.seccion = 'caja';
  });
}

// ---- AGREGAR ----
// Cada toque en un producto suma 1 a la selección; la barra de abajo agrega todo
// de una vez (función agregar_al_pedido en Supabase).
export function totalSeleccion() {
  let n = 0, usd = 0;
  for (const [id, c] of Object.entries(ped.seleccion)) {
    const m = e.menu.find(x => x.id === id); if (!m) continue;
    n += c; usd += c * m.precio_usd * (m.tipo === 'combo' ? m.unidades_combo : 1);
  }
  return { n, usd };
}
export function tocarProducto(menuId, delta) {
  const c = Math.max(0, (ped.seleccion[menuId] || 0) + delta);
  if (c) ped.seleccion[menuId] = c; else delete ped.seleccion[menuId];
  vibrate();
}
export const limpiarSeleccion = () => { ped.seleccion = {}; };

// Mezcla las filas devueltas por la base con las del pedido en pantalla
function aplicarItems(filas) {
  if (!ped.actual.pedido_items) ped.actual.pedido_items = [];
  (filas || []).forEach(f => {
    const i = ped.actual.pedido_items.findIndex(x => x.id === f.id);
    if (i >= 0) ped.actual.pedido_items[i] = f; else ped.actual.pedido_items.push(f);
  });
}

export async function confirmarAgregar() {
  if (!ped.actual || !Object.keys(ped.seleccion).length) return;
  const lista = Object.entries(ped.seleccion).map(([menu_id, cantidad]) => ({ menu_id, cantidad }));
  const { n } = totalSeleccion();
  return enCurso('agregar', async () => {
    const { data, error } = await sb.rpc('agregar_al_pedido', { p_pedido: ped.actual.id, p_items: lista });
    if (error) { showToast(msgError(error, 'No se pudo agregar'), 'danger'); return false; }
    aplicarItems(data);
    ped.seleccion = {};
    feedback(); showToast(`${n} ${plural(n, 'producto')} ${plural(n, 'agregado')} ✓`);
    ped.tab = 'consumo';
    return true;
  });
}

// Otro combo igual, sumado a la misma línea
export async function otroCombo(itemId) {
  const item = items().find(i => i.id === itemId);
  if (!item) return;
  if (!item.menu_id) return reabastecer(itemId);
  await enCurso('combo-' + itemId, async () => {
    const { data, error } = await sb.rpc('agregar_al_pedido', { p_pedido: ped.actual.id, p_items: [{ menu_id: item.menu_id, cantidad: 1 }] });
    if (error) { showToast(msgError(error, 'No se pudo agregar'), 'danger'); return; }
    aplicarItems(data); feedback();
    showToast(`Otro ${item.nombre} agregado ✓`);
  });
}

export async function agregarItemCustom({ tipo, nombre, precio_usd, unidad, cantidad }) {
  // Lo suelto se lleva de una vez: cuenta como servido al agregarlo
  const { data, error } = await sb.from('pedido_items').insert({ pedido_id: ped.actual.id, nombre, tipo, total: cantidad, consumido: tipo === 'combo' ? 0 : cantidad, precio_usd, unidad }).select().single();
  if (error) { showToast(msgError(error, 'No se pudo agregar'), 'danger'); return false; }
  aplicarItems([data]);
  feedback(); ped.tab = 'consumo';
  return true;
}

// ---- CONSUMO ----
// El número siempre es lo SERVIDO. Combo: + sirve una unidad del combo.
// Suelto: + suma otro a la cuenta; − resta uno (en 0 se quita la línea).
export async function consumir(itemId, delta) {
  const item = items().find(i => i.id === itemId); if (!item) return;
  const n = item.consumido + delta;
  if (item.tipo === 'combo') {
    if (n < 0 || n > item.total) return;
    item.consumido = n;
    feedback(); checkNotificaciones(ped.actual);
    const { error } = await sb.from('pedido_items').update({ consumido: n }).eq('id', itemId);
    if (error) { item.consumido -= delta; showToast(msgError(error, 'No se guardó el cambio'), 'danger'); }
    return;
  }
  if (n < 0) return;
  if (n === 0) return quitarItem(itemId);
  const antes = { consumido: item.consumido, total: item.total };
  item.consumido = n; item.total = n;
  feedback();
  const { error } = await sb.from('pedido_items').update({ consumido: n, total: n }).eq('id', itemId);
  if (error) { Object.assign(item, antes); showToast(msgError(error, 'No se guardó el cambio'), 'danger'); }
}

export async function reabastecer(itemId) {
  const item = items().find(i => i.id === itemId);
  if (!item) return;
  const inp = prompt(`¿Cuántas unidades agregar al combo "${item.nombre}"?`, '10');
  if (inp === null) return;
  const agregar = parseInt(inp) || 0;
  if (agregar <= 0) return;
  item.total += agregar;
  await restPatch('pedido_items', itemId, { total: item.total });
  feedback();
  showToast(`+${agregar} unidades agregadas a ${item.nombre} ✓`);
}

export async function quitarItem(itemId) {
  const item = items().find(i => i.id === itemId);
  if (item && item.tipo === 'combo' && item.consumido > 0 && !confirm(`¿Quitar "${item.nombre}" de la cuenta? Ya se sirvieron ${item.consumido}.`)) return;
  const { error } = await sb.from('pedido_items').delete().eq('id', itemId);
  if (error) { showToast(msgError(error, 'No se pudo quitar'), 'danger'); return; }
  ped.actual.pedido_items = items().filter(i => i.id !== itemId);
}

// Categoría e imagen del producto del menú (los ítems del pedido no las guardan)
export function conCategoria(item) {
  const m = e.menu.find(x => x.id === item.menu_id) || e.menu.find(x => x.nombre.toLowerCase() === String(item.nombre).toLowerCase());
  return m ? { ...item, categoria: m.categoria, imagen_url: item.imagen_url || m.imagen_url } : item;
}
