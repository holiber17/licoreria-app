// Fecha de inicio (ISO) de un período: hoy, semana (últimos 7 días) o mes en curso
export function desde(periodo) {
  const d = new Date();
  if (periodo === 'hoy') { d.setHours(0, 0, 0, 0); return d.toISOString(); }
  if (periodo === 'semana') { d.setDate(d.getDate() - 7); return d.toISOString(); }
  if (periodo === 'mes') { d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); }
  return d.toISOString();
}
