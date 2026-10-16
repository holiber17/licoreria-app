// Avisos flotantes (toasts) y acciones en curso
export const avisos = $state({ lista: [] });
let n = 0;

function poner(aviso, ms) {
  const id = ++n;
  avisos.lista.push({ id, ...aviso });
  setTimeout(() => { avisos.lista = avisos.lista.filter(a => a.id !== id); }, ms);
}

// Aviso corto de éxito o error
export function showToast(msg, tipo = 'success') {
  poner({ clase: tipo === 'success' ? 'ok' : 'error', icono: tipo === 'success' ? 'ti-circle-check' : 'ti-alert-circle', texto: msg }, 2500);
}
// Aviso grande (reemplaza al anterior). `html` ya debe venir escapado.
export function toastAlerta(html, ms = 5000, icono = 'ti-alert-triangle', arriba = false) {
  avisos.lista = avisos.lista.filter(a => a.clase !== 'alerta');
  poner({ clase: 'alerta', icono, html, arriba }, ms);
}

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
