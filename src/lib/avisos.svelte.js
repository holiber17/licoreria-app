// Avisos flotantes (toasts), estado de la conexión y acciones en curso

// Si una lectura falló, la pantalla no debe decir "Sin ventas" como si nada:
// la app del personal muestra un aviso arriba con lo que pasó.
export const conexion = $state({ fallo: '' });
export function marcarLectura(ok, status) {
  if (ok) { conexion.fallo = ''; return; }
  conexion.fallo = status === 401 ? 'sesion'
    : (typeof navigator !== 'undefined' && navigator.onLine === false) || !status ? 'red' : 'servidor';
}
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => { conexion.fallo = 'red'; });
  window.addEventListener('online', () => { if (conexion.fallo === 'red') conexion.fallo = ''; });
}
export const avisos = $state({ lista: [] });
let n = 0;

function poner(aviso, ms) {
  const id = ++n;
  avisos.lista.push({ id, ...aviso });
  setTimeout(() => { avisos.lista = avisos.lista.filter(a => a.id !== id); }, ms);
}

// Aviso corto de éxito o error
export function showToast(msg, tipo = 'success') {
  const ok = tipo === 'success';
  const ms = Math.max(ok ? 2500 : 5000, String(msg).length * 60);   // tiempo para leerlo entero
  poner({ clase: ok ? 'ok' : 'error', icono: ok ? 'ti-circle-check' : 'ti-alert-circle', texto: msg }, ms);
}
// Aviso grande (reemplaza al anterior). `html` ya debe venir escapado.
export function toastAlerta(html, ms = 5000, icono = 'ti-alert-triangle', arriba = false) {
  avisos.lista = avisos.lista.filter(a => a.clase !== 'alerta');
  poner({ clase: 'alerta', icono, html, arriba }, ms);
}

export const cerrarAviso = id => { avisos.lista = avisos.lista.filter(a => a.id !== id); };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Evita el doble toque: mientras la acción corre, `ocupado[clave]` es true
// (el botón se desactiva) y una segunda llamada se ignora.
export const ocupado = $state({});
export async function enCurso(clave, fn) {
  if (ocupado[clave]) return;
  ocupado[clave] = true;
  try { return await fn(); }
  finally { ocupado[clave] = false; }
}
