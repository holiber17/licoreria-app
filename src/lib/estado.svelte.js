// Estado global de la app del personal
const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
export const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

export const e = $state({
  pantalla: 'carga',            // carga | auth | espera | app
  user: null,
  perfil: null,
  sucursal: null,
  menu: [],
  seccion: 'pedidos',
  pedidoAbierto: false,         // dentro de un pedido la barra de tasas se oculta
  moneda: leer('moneda', 'both'),
  // Sin tasa guardada queda en 0 ("sin tasa"): nunca un valor inventado
  tasaBCV: parseFloat(leer('tasa')) || 0,
  tasaEUR: parseFloat(leer('tasaEur')) || 0,
  tasaEstado: { clase: 'loading', icono: 'ti-refresh', texto: 'Cargando...' },
  solicitudes: [],
  versionPedidos: 0,            // sube cuando el tiempo real avisa de cambios en pedidos
});

export function setMoneda(m) { e.moneda = m; guardar('moneda', m); }
export const nombreNegocio = () => e.sucursal?.app_nombre || e.sucursal?.nombre || 'Mi negocio';
// sudo: tú, ves todos los negocios. dueño: solo el suyo (supabase/negocios.sql)
export const esSudo = () => e.perfil?.rol === 'sudo';
export const esDueno = () => e.perfil?.rol === 'dueno' || esSudo();
