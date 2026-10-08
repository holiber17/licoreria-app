// ==========================================================
// Carta pública: productos y precios del día de una sucursal.
// Se abre con carta.html?s=<id de la sucursal>
// ==========================================================

const sucursalId=params.get('s');
let productos=[];
let agotados=new Set();
let categoria='';
let monedaCarta=(()=>{try{return localStorage.getItem('carta_moneda')||'usd';}catch(e){return'usd';}})();

function precioPrincipal(n){
  if(monedaCarta==='bs')return fmtBs(n);
  if(monedaCarta==='eur'&&tasas.eur)return fmtEUR(n);
  return fmtUSD(n);
}
function precioSecundario(n){
  return monedaCarta==='bs'?fmtUSD(n):fmtBs(n);
}

function setMonedaCarta(m){
  monedaCarta=m;
  try{localStorage.setItem('carta_moneda',m);}catch(e){}
  ['usd','bs','eur'].forEach(x=>document.getElementById('cm-'+x).classList.toggle('active',x===m));
  renderCarta();
}

function setCategoria(c){categoria=c;renderChips();renderCarta();}

function renderChips(){
  const cats=[...new Set(productos.map(p=>p.categoria||'General'))];
  document.getElementById('carta-chips').innerHTML=
    `<button class="chip ${categoria===''?'active':''}" onclick="setCategoria('')">Todo</button>`+
    cats.map(c=>`<button class="chip ${categoria===c?'active':''}" onclick="setCategoria(decodeURIComponent('${encodeURIComponent(c)}'))">${getCatIcon(c)} ${esc(c)}</button>`).join('');
}

function tarjeta(p){
  const agotado=agotados.has(p.nombre.toLowerCase());
  const detalle=p.tipo==='combo'?`Combo · ${p.unidades_combo} ${esc(p.unidad)}s`:`Por ${esc(p.unidad)}`;
  const totalCombo=p.tipo==='combo'?`<div class="carta-combo">Combo completo: ${precioPrincipal(p.precio_usd*p.unidades_combo)}</div>`:'';
  return`<article class="carta-item${agotado?' agotado':''}">
    <div class="carta-foto">${imgProducto(p,'carta-img','carta-icono')}${agotado?'<span class="carta-agotado">Agotado</span>':''}</div>
    <div class="carta-info">
      <div class="carta-nombre">${esc(p.nombre)}</div>
      <div class="carta-detalle">${detalle}</div>
      <div class="carta-precio">${precioPrincipal(p.precio_usd)}<span>${precioSecundario(p.precio_usd)}</span></div>
      ${totalCombo}
    </div>
  </article>`;
}

function renderCarta(){
  const el=document.getElementById('carta-lista');
  if(!productos.length)return;
  const q=(document.getElementById('carta-buscar').value||'').toLowerCase().trim();
  const lista=productos.filter(p=>
    (!categoria||(p.categoria||'General')===categoria)&&
    (!q||p.nombre.toLowerCase().includes(q)||(p.categoria||'').toLowerCase().includes(q)));
  if(!lista.length){el.innerHTML=vacio('ti-search','No encontramos ese producto.');return;}
  const cats=[...new Set(lista.map(p=>p.categoria||'General'))];
  el.innerHTML=cats.map(c=>{
    const items=lista.filter(p=>(p.categoria||'General')===c);
    return`<section><div class="slabel">${getCatIcon(c)} ${esc(c)}</div><div class="carta-grid">${items.map(tarjeta).join('')}</div></section>`;
  }).join('');
}

async function iniciarCarta(){
  const el=document.getElementById('carta-lista');
  if(!sucursalId){el.innerHTML=vacio('ti-alert-triangle','Enlace incompleto.<br>Pide el enlace de la carta al local.');return;}

  const[suc,menu,inv]=await Promise.all([
    anonGet('sucursales?select=nombre,app_nombre,logo_url,ciudad,direccion&id=eq.'+encodeURIComponent(sucursalId)),
    anonGet('menu?select=nombre,tipo,precio_usd,unidad,categoria,unidades_combo,imagen_url&sucursal_id=eq.'+encodeURIComponent(sucursalId)+'&activo=eq.true&order=categoria,nombre'),
    anonGet('inventario?select=nombre,stock_actual&sucursal_id=eq.'+encodeURIComponent(sucursalId)),
    fetchTasas()
  ]);

  const s=suc&&suc[0];
  pintarNegocio(s);
  if(s&&(s.direccion||s.ciudad)){
    document.getElementById('carta-pie').innerHTML=`<i class="ti ti-map-pin"></i> ${esc([s.direccion,s.ciudad].filter(Boolean).join(', '))}<br>Precios a la tasa oficial BCV · <strong>${esc(s.app_nombre||s.nombre)}</strong>`;
  }
  // El stock solo se ve si el dueño lo hizo público (ver supabase/cliente.sql)
  (inv||[]).forEach(i=>{if(parseFloat(i.stock_actual)<=0)agotados.add(String(i.nombre).toLowerCase());});

  document.getElementById('carta-tasa').textContent=
    `Tasa BCV: Bs ${tasas.usd.toFixed(2)} por $`+(tasas.eur?` · Bs ${tasas.eur.toFixed(2)} por €`:'');

  if(menu===null){el.innerHTML=vacio('ti-wifi-off','No pudimos cargar la carta.<br>Intenta de nuevo en un momento.');return;}
  if(!menu.length){el.innerHTML=vacio('ti-bottle','La carta está vacía por ahora.');return;}
  productos=ordenarMenu(menu);
  setMonedaCarta(monedaCarta);
  renderChips();
}

iniciarCarta();
