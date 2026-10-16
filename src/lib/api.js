// Acceso a Supabase por REST directo con el token de la sesión
import { SUPA_URL, SUPA_KEY } from './config.js';

export function tokenKeyActual() {
  try { return Object.keys(localStorage).find(k => k.includes('auth-token') || k.includes('supabase')); }
  catch (e) { return undefined; }
}

export function getToken() {
  try {
    const stored = JSON.parse(localStorage.getItem(tokenKeyActual()) || '{}');
    return stored?.access_token || SUPA_KEY;
  } catch (e) { return SUPA_KEY; }
}

// Petición genérica a /rest/v1. `prefer` va en la cabecera Prefer.
export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { Authorization: 'Bearer ' + getToken(), apikey: SUPA_KEY, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;
  return fetch(SUPA_URL + '/rest/v1/' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

// GET que devuelve siempre una lista (vacía si falla)
export async function restGet(path) {
  try { const r = await rest(path); return r.ok ? await r.json() : []; } catch (e) { return []; }
}
export const restInsert = (tabla, datos, prefer = 'return=minimal') => rest(tabla, { method: 'POST', body: datos, prefer });
export const restPatch = (tabla, id, datos) => rest(tabla + '?id=eq.' + id, { method: 'PATCH', body: datos, prefer: 'return=minimal' });
export const restDelete = (tabla, id) => rest(tabla + '?id=eq.' + id, { method: 'DELETE' });

// GET con un token explícito; devuelve la primera fila o null
export async function supaFetch(path, token) {
  const res = await fetch(SUPA_URL + '/rest/v1/' + path, {
    headers: { Authorization: 'Bearer ' + token, apikey: SUPA_KEY, Accept: 'application/json' },
  });
  // Un error (sesión vencida, red) no es lo mismo que "no existe": se lanza
  if (!res.ok) throw new Error('supaFetch ' + res.status + ' ' + path.split('?')[0]);
  const data = await res.json();
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

// Ítems de una lista de pedidos (para rankings)
export async function itemsDePedidos(pedidoIds) {
  if (!pedidoIds.length) return [];
  return restGet('pedido_items?select=*&pedido_id=in.(' + pedidoIds.join(',') + ')');
}

// ---- Páginas públicas (sin sesión) ----
export async function anonGet(path) {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + path, { headers: { apikey: SUPA_KEY, Accept: 'application/json' } });
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}
export async function anonInsert(tabla, datos) {
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/' + tabla, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(datos),
    });
    return r.ok;
  } catch (e) { return false; }
}
