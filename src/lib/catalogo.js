// Iconos de categoría y orden del menú (comunes a la app y a las páginas públicas)
export const catIcon = { 'Ron': '🥃', 'Cerveza': '🍺', 'Whisky': '🥃', 'Vodka': '🍸', 'Ginebra': '🍸', 'Anís': '🌿', 'Vino': '🍷', 'Champán': '🍾', 'Tequila': '🌵', 'Mezcladores': '🥤', 'Pasapalos': '🥜', 'Combos Especiales': '🎉', default: '🍶' };
export const getCatIcon = cat => catIcon[cat] || catIcon.default;

// Orden del menú: primero lo que más se pide; las demás categorías van
// después en orden alfabético y "General" al final. Dentro, de menor a mayor precio.
const ORDEN_CATEGORIAS = ['Combos Especiales', 'Cerveza', 'Ron', 'Whisky', 'Vodka', 'Ginebra', 'Tequila', 'Anís', 'Vino', 'Champán', 'Mezcladores', 'Pasapalos'];
function rangoCategoria(c) {
  const i = ORDEN_CATEGORIAS.indexOf(c || 'General');
  return i >= 0 ? i : (c && c !== 'General' ? ORDEN_CATEGORIAS.length : ORDEN_CATEGORIAS.length + 1);
}
export function ordenarMenu(lista) {
  return (lista || []).slice().sort((a, b) => rangoCategoria(a.categoria) - rangoCategoria(b.categoria)
    || String(a.categoria || '').localeCompare(String(b.categoria || ''), 'es')
    || (+a.precio_usd * (a.unidades_combo || 1)) - (+b.precio_usd * (b.unidades_combo || 1))
    || a.nombre.localeCompare(b.nombre, 'es'));
}

// Categorías presentes, en el orden en que aparecen
export const categoriasDe = lista => [...new Set(lista.map(m => m.categoria || 'General'))];

export const ini = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
export const plural = (n, s, p) => (n === 1 ? s : (p || s + 's'));
export const fmtUSD = n => '$' + (+n || 0).toFixed(2);
export const fmtHora = d => new Date(d).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
export function hace(fecha) {
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha)) / 60000));
  return min < 1 ? 'ahora' : min === 1 ? 'hace 1 min' : `hace ${min} min`;
}

// Mensaje legible de un error de Supabase / PostgREST
export function msgError(error, porDefecto = 'Algo salió mal. Intenta de nuevo.') {
  const m = error?.message || '';
  if (!m || /fetch|network|Failed/i.test(m)) return navigator.onLine === false ? 'Sin conexión a internet' : porDefecto;
  return m;
}

// Copiar al portapapeles (con respaldo para navegadores viejos)
export async function copiarTexto(texto) {
  try { await navigator.clipboard.writeText(texto); return true; }
  catch (e) {
    const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    t.remove();
    return ok;
  }
}
