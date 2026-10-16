// Comprobantes: impresión a PDF y envío por WhatsApp
import { esc } from '../lib/avisos.svelte.js';

// Abre el comprobante en una ventana limpia y lanza la impresión (Guardar como PDF)
export function descargarPDF(contenedor, nombre) {
  const estilos = [...document.head.querySelectorAll('link[rel="stylesheet"], style')].map(n => n.outerHTML).join('\n');
  const ventana = window.open('', '_blank');
  if (!ventana) return;
  ventana.document.write(`<!DOCTYPE html><html lang="es" data-tema="claro"><head><meta charset="UTF-8"><base href="${esc(location.href)}"><title>${esc(nombre)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Playfair+Display:wght@600;700&display=swap">
  ${estilos}
  <style>
    body{font-family:var(--sans);padding:24px;max-width:420px;margin:0 auto;background:#fff;color:#1f1812;display:block}
    .pdf-preview{border:none;padding:0}
    .t-fuerte{font-weight:700}
  </style></head><body><div class="pdf-preview">${contenedor.innerHTML}</div></body></html>`);
  ventana.document.close();
  setTimeout(() => { ventana.print(); }, 700);
}

export function abrirWhatsApp(texto) {
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(texto), '_blank');
}
