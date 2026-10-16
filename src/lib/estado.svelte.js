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
  tasaBCV: parseFloat(leer('tasa')) || 530.50,
  tasaEUR: parseFloat(leer('tasaEur')) || 580.00,
  tasaEstado: { clase: 'loading', icono: 'ti-refresh', texto: 'Cargando...' },
  solicitudes: [],
  versionPedidos: 0,            // sube cuando el tiempo real avisa de cambios en pedidos
});

export function setMoneda(m) { e.moneda = m; guardar('moneda', m); }
export const nombreNegocio = () => e.sucursal?.app_nombre || e.sucursal?.nombre || 'Mi negocio';
export const esDueno = () => e.perfil?.rol === 'dueno';
