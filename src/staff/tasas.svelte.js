// Tasa BCV (USD y EUR) desde dolarapi y su historial por sucursal
import { e, guardar } from '../lib/estado.svelte.js';
import { rest } from '../lib/api.js';

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
    e.tasaEstado = { clase: 'error', icono: 'ti-wifi-off', texto: 'Manual' };
  }
}

async function guardarTasaHoy() {
  if (!e.sucursal) return;
  await rest('tasas_bcv', { method: 'POST', prefer: 'resolution=merge-duplicates',
    body: { sucursal_id: e.sucursal.id, tasa: e.tasaBCV, fecha: new Date().toISOString().split('T')[0] } });
}
