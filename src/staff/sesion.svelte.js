// Sesión: acceso, registro, perfil y arranque
import { sb, SUPA_URL, SUPA_KEY } from '../lib/config.js';
import { rest, supaFetch, getToken, tokenKeyActual } from '../lib/api.js';
import { e } from '../lib/estado.svelte.js';
import { showToast } from '../lib/avisos.svelte.js';

export const acceso = $state({ modo: 'login', error: '' });

export function verLogin() { acceso.modo = 'login'; acceso.error = ''; }
export function verRegistro() { acceso.modo = 'registro'; acceso.error = ''; }

export async function doLogin(email, pass) {
  acceso.error = '';
  if (!email || !pass) { acceso.error = 'Completa todos los campos'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) acceso.error = error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : error.message;
}

export async function doRegister(nombre, email, pass) {
  acceso.error = '';
  if (!nombre || !email || !pass) { acceso.error = 'Completa todos los campos'; return; }
  if (pass.length < 6) { acceso.error = 'La contraseña debe tener al menos 6 caracteres'; return; }
  const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { nombre } } });
  if (error) { acceso.error = error.message; return; }
  if (data.user) {
    await sb.from('perfiles').upsert({ id: data.user.id, nombre, rol: 'empleado', sucursal_id: null }, { onConflict: 'id', ignoreDuplicates: true });
    showToast('Cuenta creada. Espera activación del dueño.');
    verLogin();
  }
}

export async function doLogout() {
  if (e.user) { try { localStorage.removeItem('perfil_cache_' + e.user.id); } catch (_) {} }
  await sb.auth.signOut();
  e.user = null; e.perfil = null; e.sucursal = null;
  e.pantalla = 'auth';
}

// El dueño todavía no asignó sucursal: se revisa de nuevo
export async function checkActivation() {
  const { data: p } = await sb.from('perfiles').select('*,sucursales(*)').eq('id', e.user.id).single();
  if (p && p.sucursal_id) { e.perfil = p; entrar(); }
  else showToast('Aún pendiente. Contacta al dueño.', 'danger');
}

function entrar() {
  e.sucursal = e.perfil.sucursales || { id: e.perfil.sucursal_id, nombre: 'Mi sucursal' };
  e.pantalla = 'app';
}

const cache = id => { try { return localStorage.getItem('perfil_cache_' + id); } catch (_) { return null; } };

async function initApp(u) {
  e.user = u;
  try {
    // Con caché la app abre al instante y el perfil se refresca detrás
    const guardado = cache(u.id);
    if (guardado) {
      e.perfil = JSON.parse(guardado);
      if (e.perfil.sucursal_id) { entrar(); refreshPerfilCache(u); return; }
    }
    await refreshPerfilCache(u);
  } catch (err) {
    console.error('initApp error:', err);
    const guardado = cache(u.id);
    if (guardado) { e.perfil = JSON.parse(guardado); if (e.perfil.sucursal_id) { entrar(); return; } }
    e.pantalla = 'auth';
  }
}

async function refreshPerfilCache(u) {
  try {
    const token = getToken();
    const p = await supaFetch('perfiles?select=id,nombre,rol,sucursal_id&id=eq.' + u.id, token);
    if (!p) {
      // Solo crea el perfil si de verdad no existe; nunca pisa uno existente
      await rest('perfiles', { method: 'POST', prefer: 'resolution=ignore-duplicates',
        body: { id: u.id, nombre: u.user_metadata?.nombre || u.email, rol: 'empleado', sucursal_id: null } });
      e.pantalla = 'espera'; return;
    }
    e.perfil = p;
    if (!p.sucursal_id) { e.pantalla = 'espera'; return; }
    const suc = await supaFetch('sucursales?select=id,nombre,ciudad,logo_url,app_nombre&id=eq.' + p.sucursal_id, token);
    e.perfil.sucursales = suc || { id: p.sucursal_id, nombre: 'Mi sucursal' };
    try { localStorage.setItem('perfil_cache_' + u.id, JSON.stringify(e.perfil)); } catch (_) {}
    if (!e.sucursal) entrar();
  } catch (err) {
    console.error('refreshPerfilCache error:', err);
    // Sin caché no hay con qué entrar: volver al acceso en vez de quedar colgado
    if (!e.sucursal) e.pantalla = 'auth';
  }
}

// Recupera la sesión guardada: verifica el token (o lo renueva) sin pasar por el cliente de Supabase
async function boot() {
  const tokenKey = tokenKeyActual();
  if (tokenKey) {
    try {
      const stored = JSON.parse(localStorage.getItem(tokenKey));
      const accessToken = stored?.access_token;
      if (accessToken) {
        const res = await fetch(SUPA_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + accessToken, apikey: SUPA_KEY } });
        if (res.ok) {
          const d = await res.json();
          if (d?.id) { await initApp({ id: d.id, email: d.email, user_metadata: d.user_metadata || {} }); return; }
        } else if (stored?.refresh_token) {
          const rres = await fetch(SUPA_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
            body: JSON.stringify({ refresh_token: stored.refresh_token }),
          });
          if (rres.ok) {
            const rd = await rres.json();
            if (rd?.access_token) {
              localStorage.setItem(tokenKey, JSON.stringify(rd));
              await initApp({ id: rd.user.id, email: rd.user.email, user_metadata: rd.user.user_metadata || {} });
              return;
            }
          }
        }
      }
    } catch (err) { console.error('boot error:', err); }
  }
  e.pantalla = 'auth';
}

export function iniciarSesion() {
  // Escuchar login/logout
  sb.auth.onAuthStateChange(async (evento, session) => {
    if (evento === 'SIGNED_IN' && session?.user) { e.pantalla = 'carga'; await initApp(session.user); }
    else if (evento === 'SIGNED_OUT') e.pantalla = 'auth';
  });
  return boot();
}
