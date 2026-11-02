// Quién tiene la app abierta ahora: cada teléfono se anuncia en un canal en vivo
// de Supabase (presence). No guarda nada en la base: al cerrar la app o perder
// la señal, la persona desaparece sola de la lista.
// Hay un canal por negocio, para que el dueño de un negocio no vea a la gente de
// otro. El sudo escucha todos y se anuncia solo en el del negocio donde está.
import { sb } from '../lib/supabase.js';
import { restGet } from '../lib/api.js';
import { e, esSudo } from '../lib/estado.svelte.js';

export const presencia = $state({ enLinea: {} });   // id de usuario -> { nombre, sucursal_id, desde }
const canales = new Map();                          // id de negocio -> canal

const negocioActual = () => e.sucursal?.negocio_id || 'sin-negocio';

function juntar() {
  const m = {};
  // Con dos teléfonos abiertos la misma persona trae dos entradas: vale la última
  for (const canal of canales.values())
    for (const [id, entradas] of Object.entries(canal.presenceState())) m[id] = entradas[entradas.length - 1];
  presencia.enLinea = m;
}

function anunciar() {
  if (!e.user) return;
  const yo = { nombre: e.perfil?.nombre || e.user.email || '', sucursal_id: e.sucursal?.id || null, desde: new Date().toISOString() };
  for (const [negocio, canal] of canales) {
    (negocio === negocioActual() ? canal.track(yo) : canal.untrack()).catch(() => {});
  }
}

function unirse(negocio) {
  if (canales.has(negocio)) return;
  try {
    const canal = sb.channel('presencia-' + negocio, { config: { presence: { key: e.user.id } } });
    canales.set(negocio, canal);
    canal.on('presence', { event: 'sync' }, juntar)
      .subscribe(estado => { if (estado === 'SUBSCRIBED' && negocio === negocioActual()) anunciar(); });
  } catch (err) { canales.delete(negocio); }
}

export async function iniciarPresencia() {
  if (canales.size || !e.user || !sb.channel) return;
  unirse(negocioActual());
  if (esSudo()) ((await restGet('negocios?select=id')) || []).forEach(n => unirse(n.id));
}

// Al cambiar de sucursal (el sudo puede pasar a otro negocio)
export function actualizarPresencia() {
  if (!e.user || !sb.channel) return;
  unirse(negocioActual());
  anunciar();
}

export function detenerPresencia() {
  for (const canal of canales.values()) sb.removeChannel(canal);
  canales.clear();
  presencia.enLinea = {};
}

// Gancho para las pruebas automáticas (sin servidor en vivo)
if (typeof window !== 'undefined') window.__licor = { ...(window.__licor || {}), ponerPresencia: m => { presencia.enLinea = m; } };
