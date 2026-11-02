// Genera la fuente de iconos solo con los iconos que la app usa.
// La fuente completa de Tabler pesa ~750 KB y la app usa unos 80 iconos (~15 KB).
// Corre sola antes de `npm run dev` y `npm run build`. Escribe:
//   src/css/iconos.css    (@font-face + las clases .ti-* usadas)
//   src/css/iconos.woff2  (la fuente recortada)
// Si el código usa un icono que no existe en Tabler, falla y lo dice.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const tabler = join(raiz, 'node_modules', '@tabler', 'icons-webfont');

// 1) Nombres de icono usados en src/ (todos aparecen escritos completos: no se arman por partes)
function archivos(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : /\.(svelte|js|html)$/.test(f) ? [p] : [];
  });
}
const usados = new Set();
for (const f of [...archivos(join(raiz, 'src')), join(raiz, 'index.html'), join(raiz, 'carta.html'), join(raiz, 'pedido.html')]) {
  for (const m of readFileSync(f, 'utf8').matchAll(/\bti-[a-z0-9]+(?:-[a-z0-9]+)*/g)) usados.add(m[0]);
}

// 2) Su código en la fuente, leído del CSS de Tabler
const css = readFileSync(join(tabler, 'tabler-icons.min.css'), 'utf8');
const codigos = new Map([...css.matchAll(/\.(ti-[a-z0-9-]+):before\{content:"\\([0-9a-f]+)"\}/g)].map(m => [m[1], m[2]]));
const faltan = [...usados].filter(n => !codigos.has(n));
if (faltan.length) {
  console.error('Iconos que no existen en Tabler 2.44: ' + faltan.join(', '));
  process.exit(1);
}
const lista = [...usados].sort();

// 3) Fuente recortada y su CSS
const ttf = readFileSync(join(tabler, 'fonts', 'tabler-icons.ttf'));
const texto = lista.map(n => String.fromCodePoint(parseInt(codigos.get(n), 16))).join('');
// La tabla GSUB de Tabler 2.44 viene dañada (y los iconos no la necesitan): se quita
const woff2 = await subsetFont(ttf, texto, { targetFormat: 'woff2', dropTables: ['GSUB', 'GPOS'], noLayoutClosure: true });
writeFileSync(join(raiz, 'src', 'css', 'iconos.woff2'), woff2);
writeFileSync(join(raiz, 'src', 'css', 'iconos.css'),
  '/* Generado por scripts/iconos.mjs — no editar a mano. Tabler Icons 2.44.0 (MIT). */\n' +
  '@font-face{font-family:"tabler-icons";font-style:normal;font-weight:400;font-display:block;src:url("./iconos.woff2") format("woff2")}\n' +
  '.ti{font-family:"tabler-icons"!important;speak:none;font-style:normal;font-weight:normal;font-variant:normal;text-transform:none;line-height:1;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}\n' +
  lista.map(n => `.${n}:before{content:"\\${codigos.get(n)}"}`).join('\n') + '\n');
console.log(`iconos: ${lista.length} iconos, ${(woff2.length / 1024).toFixed(1)} KB`);
