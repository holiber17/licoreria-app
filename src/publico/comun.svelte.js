// Base común de las páginas públicas (carta y pedido del cliente):
// no hay sesión, solo la clave pública de Supabase.
import { fmtUSD } from '../lib/catalogo.js';
export { fmtUSD };

// Tasas del día (Bs por USD y por EUR)
export const tasas = $state({ usd: 530, eur: 0 });

export async function fetchTasas() {
  try {
    const [rU, rE] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/cotizaciones'),
    ]);
    if (rU.ok) { const d = await rU.json(); tasas.usd = parseFloat(d.promedio) || tasas.usd; }
    if (rE.ok) {
      const d = await rE.json();
      const eur = Array.isArray(d) ? d.find(c => String(c.moneda || '').toUpperCase() === 'EUR') : d;
      tasas.eur = parseFloat(eur && eur.promedio) || tasas.eur;
    }
  } catch (err) {}
}

export const fmtBs = (n, t) => 'Bs ' + Math.round((+n || 0) * (t || tasas.usd)).toLocaleString('es-VE');
export const fmtEUR = n => '€' + (tasas.eur ? (+n || 0) * tasas.usd / tasas.eur : 0).toFixed(2);
