// Quién tiene la app abierta ahora: cada teléfono se anuncia en un canal en vivo
// de Supabase (presence). No guarda nada en la base: al cerrar la app o perder
// la señal, la persona desaparece sola de la lista.
import { sb } from '../lib/supabase.js';
import { e } from '../lib/estado.svelte.js';

export const presencia = $state({ enLinea: {} });   // id de usuario -> { nombre, sucursal_id, desde }
let canal = null;

function anunciar() {
  if (!canal || !e.user) return;
  canal.track({ nombre: e.perfil?.nombre || e.user.email || '', sucursal_id: e.sucursal?.id || null, desde: new Date().toISOString() })
    .catch(() => {});
}

export function iniciarPresencia() {
  if (canal || !e.user || !sb.channel) return;
  try {
    canal = sb.channel('presencia-licoapp', { config: { presence: { key: e.user.id } } });
    canal
      .on('presence', { event: 'sync' }, () => {
        const m = {};
        // Con dos teléfonos abiertos la misma persona trae dos entradas: vale la última
        for (const [id, entradas] of Object.entries(canal.presenceState())) m[id] = entradas[entradas.length - 1];
        presencia.enLinea = m;
      })
      .subscribe(estado => { if (estado === 'SUBSCRIBED') anunciar(); });
  } catch (err) { canal = null; }
}

// Al cambiar de sucursal, los demás ven dónde está ahora
export const actualizarPresencia = anunciar;

export function detenerPresencia() {
  if (canal) { sb.removeChannel(canal); canal = null; }
  presencia.enLinea = {};
}

// Gancho para las pruebas automáticas (sin servidor en vivo)
if (typeof window !== 'undefined') window.__licor = { ...(window.__licor || {}), ponerPresencia: m => { presencia.enLinea = m; } };
