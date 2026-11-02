// Cliente de Supabase con sesión (app del personal)
import { createClient } from '@supabase/supabase-js';
import { SUPA_URL, SUPA_KEY } from './config.js';

export const sb = createClient(SUPA_URL, SUPA_KEY, {
  auth: { storage: localStorage, persistSession: true, detectSessionInUrl: false },
});
