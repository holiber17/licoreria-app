// ==========================================================
// Configuración y estado global de la app
// ==========================================================

const SUPA_URL='https://ysnsmsfeqbnezjgxkkui.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzbnNtc2ZlcWJuZXpqZ3hra3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDE3NDQsImV4cCI6MjA5NTM3Nzc0NH0.Xn6IwKjoTTRRvuyXIai7tz0iq1rhKEKrs46ZMwLfr3s';
const{createClient}=supabase;
const sb=createClient(SUPA_URL,SUPA_KEY,{auth:{storage:localStorage,persistSession:true,detectSessionInUrl:false}});

const LOGO_URL=new URL('icon.svg',location.href).href;

let user=null,perfil=null,sucursalActual=null,pedidoActual=null,menuItems=[];
let moneda=localStorage.getItem('moneda')||'both';
let tasaBCV=parseFloat(localStorage.getItem('tasa'))||530.50;
let tasaEUR=parseFloat(localStorage.getItem('tasaEur'))||580.00;
