// ==========================================================
// Comprobantes: cuenta del cliente y cierre de caja
// (vista previa, impresión a PDF y envío por WhatsApp)
// ==========================================================

function cerrarPdfModal(tipo){cerrarModal('pdf-modal-'+tipo);}

function cabeceraPdf(subtitulos){
  return`<div class="pdf-header">
    <img class="pdf-logo" src="${LOGO_URL}" alt="">
    <div class="pdf-title">${esc(nombreNegocio())}</div>
    ${subtitulos}
  </div>`;
}

function generarPDFCuenta(){
  if(!pedidoActual)return;
  const items=pedidoActual.pedido_items||[];
  const total=items.reduce((s,i)=>s+(i.consumido*i.precio_usd),0);
  const fecha=new Date().toLocaleString('es-VE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const tasaActual=tasa();

  let html=cabeceraPdf(`<div class="pdf-sub">Cuenta del pedido · ${fecha}</div>
    <div class="pdf-sub fuerte">Cliente: ${esc(pedidoActual.cliente_nombre)}</div>`);

  html+=items.map(i=>`<div class="pdf-row">
    <span>${esc(i.nombre)} × ${i.consumido} ${esc(i.unidad)}${i.consumido!==1?'s':''}</span>
    <div class="der">
      <div>${fmtUSD(i.consumido*i.precio_usd)}</div>
      <div class="bs">${fmtBsCon(i.consumido*i.precio_usd,tasaActual)}</div>
    </div>
  </div>`).join('');

  html+=`<div class="pdf-total">
    <span>TOTAL</span>
    <div class="der">
      <div>${fmtUSD(total)}</div>
      <div class="bs">${fmtBsCon(total,tasaActual)}</div>
    </div>
  </div>
  <div class="pdf-footer">Método de pago: ${esc(metodoPago||'por definir')} · Tasa BCV: ${tasaActual.toFixed(2)} Bs/$<br>Gracias por su preferencia</div>`;

  $('pdf-content-cuenta').innerHTML=html;
  abrirModal('pdf-modal-cuenta');
}

async function generarPDFCaja(){
  if(!sucursalActual)return;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const caja=await restGet('caja?select=*&sucursal_id=eq.'+sucursalActual.id+'&fecha=gte.'+hoy.toISOString()+'&order=fecha.asc');
  const r=resumenCaja(caja);
  const fecha=new Date().toLocaleDateString('es-VE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})+' · '+fmtHora(new Date());
  const tasaActual=tasa();

  let html=cabeceraPdf(`<div class="pdf-sub">Cierre de caja · ${fecha}</div>
    <div class="pdf-sub">Tasa BCV: ${tasaActual.toFixed(2)} Bs/$</div>`)+`
  <div class="pdf-row"><span class="t-fuerte">Total pedidos cobrados</span><span class="t-fuerte">${r.num}</span></div>
  <div class="pdf-row"><span class="t-fuerte">Ticket promedio</span><span>${fmtUSD(r.ticket)}</span></div>
  <div class="pdf-seccion">Detalle de pedidos</div>`;

  html+=caja.map(p=>`<div class="pdf-row">
    <div>
      <div class="t-fuerte">${esc(p.cliente_nombre)}</div>
      <div class="det">${new Date(p.fecha).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})} · ${esc(p.metodo_pago||'Efectivo')}${p.nota?' · '+esc(p.nota):''}</div>
    </div>
    <div class="der">
      <div>${fmtUSD(p.total_usd)}</div>
      <div class="bs">${fmtBsCon(p.total_usd,p.tasa_bcv||tasaActual)}</div>
    </div>
  </div>`).join('');

  html+=`<div class="pdf-total">
    <span>TOTAL DEL DÍA</span>
    <div class="der">
      <div>${fmtUSD(r.totalUSD)}</div>
      <div class="bs">${fmtBsTotal(r.totalBs)}</div>
    </div>
  </div>
  <div class="pdf-footer">Generado el ${new Date().toLocaleString('es-VE')} · ${esc(nombreNegocio())}</div>`;

  $('pdf-content-caja').innerHTML=html;
  abrirModal('pdf-modal-caja');
}

// Abre el comprobante en una ventana limpia y lanza la impresión (Guardar como PDF)
function descargarPDF(tipo){
  const contenido=$('pdf-content-'+tipo).innerHTML;
  const nombre=tipo==='cuenta'?`Cuenta_${pedidoActual?.cliente_nombre||'cliente'}`:'Cierre_Caja';
  const css=n=>new URL('css/'+n,location.href).href;
  const ventana=window.open('','_blank');
  ventana.document.write(`<!DOCTYPE html><html lang="es" data-tema="claro"><head><meta charset="UTF-8"><title>${esc(nombre)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Playfair+Display:wght@600;700&display=swap">
  <link rel="stylesheet" href="${css('tokens.css')}">
  <link rel="stylesheet" href="${css('impresion.css')}">
  <style>
    body{font-family:var(--sans);padding:24px;max-width:420px;margin:0 auto;background:#fff;color:#1f1812}
    .pdf-preview{border:none;padding:0}
    .t-fuerte{font-weight:700}
  </style></head><body><div class="pdf-preview">${contenido}</div></body></html>`);
  ventana.document.close();
  setTimeout(()=>{ventana.print();},700);
}

function compartirWhatsApp(tipo){
  const nombre=tipo==='cuenta'?pedidoActual?.cliente_nombre||'cliente':nombreNegocio();
  const tasaActual=tasa();
  let texto='';
  if(tipo==='cuenta'){
    const items=pedidoActual?.pedido_items||[];
    const total=items.reduce((s,i)=>s+(i.consumido*i.precio_usd),0);
    const fecha=new Date().toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+fmtHora(new Date());
    texto=`🍾 *${nombreNegocio()}*\n`;
    texto+=`📋 Cuenta de: *${nombre}*\n`;
    texto+=`📅 ${fecha}\n\n`;
    items.filter(i=>i.consumido>0).forEach(i=>{
      texto+=`• ${i.nombre} × ${i.consumido}: ${fmtUSD(i.consumido*i.precio_usd)}\n`;
    });
    texto+=`\n💰 *TOTAL: ${fmtUSD(total)}*\n`;
    texto+=`🇻🇪 Bs ${Math.round(total*tasaActual).toLocaleString('es-VE')}\n`;
    texto+=`📊 Tasa BCV: ${tasaActual.toFixed(2)} Bs/$`;
  } else {
    texto=`🍾 *${nombre}*\n`;
    texto+=`📊 Cierre de caja - ${new Date().toLocaleDateString('es-VE')} · ${fmtHora(new Date())}\n`;
    texto+=`\nSe generó el reporte del día.\n`;
    texto+=`📊 Tasa BCV: ${tasaActual.toFixed(2)} Bs/$`;
  }
  window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(texto),'_blank');
}
