// Tasa BCV (USD y EUR) desde dolarapi y su historial por sucursal
import { e, guardar } from '../lib/estado.svelte.js';
import { rest } from '../lib/api.js';
import { hoyCaracas } from '../lib/fechas.js';

export async function fetchBCV() {
  e.tasaEstado = { clase: 'loading', icono: 'ti-refresh', texto: 'Cargando...' };
  try {
    // USD y EUR en paralelo
    const [rUSD, rEUR] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/cotizaciones'),
    ]);
    if (!rUSD.ok) throw new Error();
    const dUSD = await rUSD.json();
    const tUSD = parseFloat(dUSD.promedio);
    if (!tUSD || isNaN(tUSD)) throw new Error();
    e.tasaBCV = tUSD; guardar('tasa', tUSD);

    if (rEUR.ok) {
      const dEUR = await rEUR.json();
      const cEUR = Array.isArray(dEUR) ? dEUR.find(c => String(c.moneda || '').toUpperCase() === 'EUR') : dEUR;
      const tEUR = parseFloat(cEUR && cEUR.promedio);
      if (tEUR && !isNaN(tEUR)) { e.tasaEUR = tEUR; guardar('tasaEur', tEUR); }
    }
    const fecha = dUSD.fechaActualizacion ? new Date(dUSD.fechaActualizacion).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }) : '';
    e.tasaEstado = { clase: '', icono: 'ti-check', texto: 'BCV' + (fecha ? ' · ' + fecha : '') };
    guardarTasaHoy();
  } catch (err) {
    // Sin dolarapi: se sigue con la última tasa guardada; si no hay ninguna, no se inventa
    e.tasaEstado = e.tasaBCV > 0
      ? { clase: 'error', icono: 'ti-wifi-off', texto: 'Última guardada' }
      : { clase: 'error', icono: 'ti-alert-triangle', texto: 'Sin tasa' };
  }
}

// La tasa del día de la sucursal es la que usa el cobro (y la que ve el cliente).
// La fecha es la de Caracas: con la de UTC, después de las 8 pm se guardaba como mañana.
async function guardarTasaHoy() {
  if (!e.sucursal || !(e.tasaBCV > 0)) return false;
  try {
    const r = await rest('tasas_bcv', { method: 'POST', prefer: 'resolution=merge-duplicates',
      body: { sucursal_id: e.sucursal.id, tasa: e.tasaBCV, fecha: hoyCaracas() } });
    return r.ok;
  } catch (err) { return false; }
}

// Tasa puesta a mano por el dueño (cuando dolarapi no responde o da un valor errado).
// Si dolarapi vuelve a responder, la oficial la reemplaza.
export async function ponerTasaManual(valor) {
  const t = parseFloat(String(valor).replace(',', '.'));
  if (!(t > 0)) return false;
  e.tasaBCV = t; guardar('tasa', t);
  e.tasaEstado = { clase: 'error', icono: 'ti-pencil', texto: 'Manual' };
  return guardarTasaHoy();
}
