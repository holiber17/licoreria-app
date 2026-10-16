// Notificaciones del sistema (permiso, última unidad de un combo)
import { LOGO_URL } from '../lib/config.js';
import { e } from '../lib/estado.svelte.js';
import { sonidoAlerta } from '../lib/sonidos.js';
import { toastAlerta, esc } from '../lib/avisos.svelte.js';

export let notifPermiso = false;
const leerHoy = () => { try { return new Set(JSON.parse(localStorage.getItem('notif_hoy') || '[]')); } catch (_) { return new Set(); } };
const notificadosHoy = leerHoy();

export async function pedirPermisoNotif() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { notifPermiso = true; return; }
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    notifPermiso = perm === 'granted';
  }
}
export const puedeNotificar = () => notifPermiso && 'Notification' in window && Notification.permission === 'granted';

function notifUltimaUnidad(itemNombre, pedidoNombre) {
  const key = itemNombre + '|' + pedidoNombre;
  if (notificadosHoy.has(key)) return;
  notificadosHoy.add(key);
  try { localStorage.setItem('notif_hoy', JSON.stringify([...notificadosHoy])); } catch (_) {}

  sonidoAlerta();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  toastAlerta('<strong>' + esc(itemNombre) + '</strong><br>¡Última unidad! (' + esc(pedidoNombre) + ')');

  if (puedeNotificar()) {
    new Notification('⚠️ Última unidad', {
      body: itemNombre + ' — queda 1 unidad (' + pedidoNombre + ')',
      icon: LOGO_URL, badge: LOGO_URL, tag: key, requireInteraction: true,
    });
  }
}

// Avisa cuando a un combo del pedido le queda una sola unidad
export function checkNotificaciones(pedido) {
  if (!pedido) return;
  (pedido.pedido_items || []).forEach(item => {
    if (item.tipo === 'combo' && (item.total - item.consumido) === 1) notifUltimaUnidad(item.nombre, pedido.cliente_nombre);
  });
}
