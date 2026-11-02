// Fechas en hora de Venezuela, sin depender de la zona del teléfono.
// Venezuela está en UTC-4 todo el año (sin horario de verano desde 2016).
const ZONA = 'America/Caracas';
const OFFSET = '-04:00';

// 'AAAA-MM-DD' de un momento en Caracas (en-CA da justo ese formato)
export const hoyCaracas = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);
export const diaCaracas = iso => hoyCaracas(new Date(iso));

// Medianoche de Caracas de un día 'AAAA-MM-DD', como ISO en UTC (para filtrar en la base)
export const inicioDia = dia => new Date(dia + 'T00:00:00' + OFFSET).toISOString();

// Suma días a un 'AAAA-MM-DD'
export function sumarDias(dia, n) {
  const d = new Date(dia + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
