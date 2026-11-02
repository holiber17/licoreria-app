// Montos en bolívares con céntimos, y cuentas divididas que suman exacto

// Bs con 2 decimales en formato venezolano: 8.093,52
export const bs = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Para pegar en la app del banco: sin separador de miles y con coma decimal (8093,52)
export const bsParaCopiar = n => (Math.round((+n || 0) * 100) / 100).toFixed(2).replace('.', ',');

// Reparte un monto entre n personas en céntimos, sin perder ninguno:
// $10 entre 3 → [3.34, 3.33, 3.33]
export function repartir(monto, n) {
  const cent = Math.round((+monto || 0) * 100);
  const k = Math.max(1, n | 0);
  const base = Math.floor(cent / k), resto = cent - base * k;
  return Array.from({ length: k }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}
