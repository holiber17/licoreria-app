// Fechas en hora de Venezuela, sin depender de la zona del teléfono
const ZONA = 'America/Caracas';

// 'AAAA-MM-DD' de hoy en Caracas (en-CA da justo ese formato)
export const hoyCaracas = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);
