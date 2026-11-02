// Cliente de Supabase con sesión (app del personal)
import { createClient } from '@supabase/supabase-js';
import { SUPA_URL, SUPA_KEY } from './config.js';

export const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: { storage: localStorage, persistSession: true, detectSessionInUrl: false },
});

// Cliente sin sesión (páginas públicas: solo tiempo real). Se carga aparte y
// bajo demanda para que la carta y el pedido no descarguen supabase-js.
export function clienteAnonimo() {
  return createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
