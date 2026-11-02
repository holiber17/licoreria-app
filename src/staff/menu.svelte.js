// Menú del negocio: lo que se vende (combos y bebidas sueltas)
import { e } from '../lib/estado.svelte.js';
import { restGet } from '../lib/api.js';
import { ordenarMenu } from '../lib/catalogo.js';

export async function loadMenu() {
  if (!e.sucursal) return;
  e.menu = ordenarMenu(await restGet('menu?select=*&sucursal_id=eq.' + e.sucursal.id + '&activo=eq.true&order=categoria'));
}
