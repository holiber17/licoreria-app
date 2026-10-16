// Configuración común: conexión a Supabase y datos de la marca
import { createClient } from '@supabase/supabase-js';

export const SUPA_URL = 'https://ysnsmsfeqbnezjgxkkui.supabase.co';
export const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzbnNtc2ZlcWJuZXpqZ3hra3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDE3NDQsImV4cCI6MjA5NTM3Nzc0NH0.Xn6IwKjoTTRRvuyXIai7tz0iq1rhKEKrs46ZMwLfr3s';
export const LOGO_URL = new URL('icon.svg', location.href).href;

// Cliente con sesión (app del personal)
export const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: { storage: localStorage, persistSession: true, detectSessionInUrl: false },
});

// Cliente sin sesión (páginas públicas: solo tiempo real)
export function clienteAnonimo() {
  return createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
