// Configuración común: conexión a Supabase y datos de la marca.
// Solo constantes: las páginas públicas importan esto sin cargar supabase-js
// (el cliente con sesión está en supabase.js, solo para la app del personal).
export const SUPA_URL = 'https://ysnsmsfeqbnezjgxkkui.supabase.co';
export const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzbnNtc2ZlcWJuZXpqZ3hra3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDE3NDQsImV4cCI6MjA5NTM3Nzc0NH0.Xn6IwKjoTTRRvuyXIai7tz0iq1rhKEKrs46ZMwLfr3s';
export const LOGO_URL = new URL('icon.svg', location.href).href;
