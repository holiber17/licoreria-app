// Formato de montos según la moneda y las tasas elegidas
import { e } from './estado.svelte.js';
import { fmtUSD } from './catalogo.js';
export { fmtUSD };

export const tasa = () => e.tasaBCV;
export const tasaEur = () => e.tasaEUR;
export const fmtBs = n => 'Bs ' + Math.round((+n || 0) * e.tasaBCV).toLocaleString('es-VE');
export const fmtBsCon = (n, t) => 'Bs ' + Math.round((+n || 0) * (parseFloat(t) || e.tasaBCV)).toLocaleString('es-VE');
export const usdAEur = n => (e.tasaEUR ? (+n || 0) * e.tasaBCV / e.tasaEUR : 0);
export const fmtEUR = n => '€' + usdAEur(n).toFixed(2);
export const fmtBsTotal = n => 'Bs ' + Math.round(n).toLocaleString('es-VE');

export function fmtPrice(n) {
  if (e.moneda === 'usd') return fmtUSD(n);
  if (e.moneda === 'eur') return fmtEUR(n);
  if (e.moneda === 'bs') return fmtBs(n);
  return fmtUSD(n) + ' / ' + fmtEUR(n) + ' / ' + fmtBs(n);
}

// ---- Cálculos de caja ----
export function resumenCaja(registros) {
  const totalUSD = registros.reduce((s, p) => s + parseFloat(p.total_usd || 0), 0);
  const num = registros.length;
  const totalBs = registros.reduce((s, p) => s + (parseFloat(p.total_usd || 0) * parseFloat(p.tasa_bcv || e.tasaBCV)), 0);
  return { totalUSD, num, ticket: num > 0 ? totalUSD / num : 0, totalBs };
}
// Agrupa ítems vendidos por nombre sumando cantidad y total
export function agruparItems(items) {
  const res = {};
  (items || []).forEach(i => {
    if (!res[i.nombre]) res[i.nombre] = { nombre: i.nombre, cant: 0, total: 0 };
    res[i.nombre].cant += i.consumido; res[i.nombre].total += i.consumido * i.precio_usd;
  });
  return Object.values(res);
}
export const totalDe = items => (items || []).reduce((s, i) => s + (i.consumido * i.precio_usd), 0);
export const fechaCorta = f => new Date(f).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
