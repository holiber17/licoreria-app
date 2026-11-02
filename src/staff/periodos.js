// Inicio de un período en hora de Caracas: hoy, semana (los últimos 7 días
// contando hoy) o mes en curso. Antes dependía de la zona del teléfono y de UTC,
// y las ventas de 8 pm a medianoche caían en el día siguiente.
import { hoyCaracas, inicioDia, sumarDias } from '../lib/fechas.js';

// Primer día del período, 'AAAA-MM-DD'
export function desdeDia(periodo, ahora = new Date()) {
  const hoy = hoyCaracas(ahora);
  if (periodo === 'semana') return sumarDias(hoy, -6);
  if (periodo === 'mes') return hoy.slice(0, 8) + '01';
  return hoy;
}

// El mismo inicio como ISO en UTC, para filtrar fechas en la base
export const desde = (periodo, ahora) => inicioDia(desdeDia(periodo, ahora));
