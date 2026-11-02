// Base común de las páginas públicas (carta y pedido del cliente):
// no hay sesión, solo la clave pública de Supabase.
import { fmtUSD } from '../lib/catalogo.js';
import { bs } from '../lib/dinero.js';
export { fmtUSD };

// Tasas del día (Bs por USD y por EUR). Sin tasa quedan en 0: nunca un valor inventado.
// La del USD viene de la sucursal (la misma con la que se cobra); dolarapi solo
// la completa si la base todavía no la tiene.
export const tasas = $state({ usd: 0, eur: 0, delNegocio: false });
export function usarTasaDelNegocio(t) {
  const v = parseFloat(t);
  if (v > 0) { tasas.usd = v; tasas.delNegocio = true; }
}

export async function fetchTasas() {
  try {
    const [rU, rE] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/cotizaciones'),
    ]);
    if (rU.ok && !tasas.delNegocio) { const d = await rU.json(); tasas.usd = parseFloat(d.promedio) || tasas.usd; }
    if (rE.ok) {
      const d = await rE.json();
      const eur = Array.isArray(d) ? d.find(c => String(c.moneda || '').toUpperCase() === 'EUR') : d;
      tasas.eur = parseFloat(eur && eur.promedio) || tasas.eur;
    }
  } catch (err) {}
}

export const fmtBs = (n, t) => { const tasa = parseFloat(t) || tasas.usd; return tasa ? 'Bs ' + bs((+n || 0) * tasa) : 'Bs —'; };
export const fmtEUR = n => (tasas.eur && tasas.usd ? '€' + ((+n || 0) * tasas.usd / tasas.eur).toFixed(2) : '€ —');
