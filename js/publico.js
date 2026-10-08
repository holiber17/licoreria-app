// ==========================================================
// Base común de las páginas públicas (pedido.html y carta.html):
// no hay sesión, se usa solo la clave pública de Supabase.
// ==========================================================

const SUPA_URL='https://ysnsmsfeqbnezjgxkkui.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzbnNtc2ZlcWJuZXpqZ3hra3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDE3NDQsImV4cCI6MjA5NTM3Nzc0NH0.Xn6IwKjoTTRRvuyXIai7tz0iq1rhKEKrs46ZMwLfr3s';
const LOGO_URL=new URL('icon.svg',location.href).href;
const params=new URLSearchParams(window.location.search);

const catIcon={'Ron':'🥃','Cerveza':'🍺','Whisky':'🥃','Vodka':'🍸','Ginebra':'🍸','Anís':'🌿','Vino':'🍷','Champán':'🍾','Tequila':'🌵','Mezcladores':'🥤','Pasapalos':'🥜','Combos Especiales':'🎉','default':'🍶'};
function getCatIcon(cat){return catIcon[cat]||catIcon['default'];}
// Orden del menú: primero lo que más se pide; las demás categorías van
// después en orden alfabético y "General" al final. Dentro, de menor a mayor precio.
const ORDEN_CATEGORIAS=['Combos Especiales','Cerveza','Ron','Whisky','Vodka','Ginebra','Tequila','Anís','Vino','Champán','Mezcladores','Pasapalos'];
function rangoCategoria(c){const i=ORDEN_CATEGORIAS.indexOf(c||'General');return i>=0?i:(c&&c!=='General'?ORDEN_CATEGORIAS.length:ORDEN_CATEGORIAS.length+1);}
function ordenarMenu(lista){
  return(lista||[]).slice().sort((a,b)=>rangoCategoria(a.categoria)-rangoCategoria(b.categoria)
    ||String(a.categoria||'').localeCompare(String(b.categoria||''),'es')
    ||(+a.precio_usd*(a.unidades_combo||1))-(+b.precio_usd*(b.unidades_combo||1))
    ||a.nombre.localeCompare(b.nombre,'es'));
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtUSD(n){return'$'+(+n||0).toFixed(2);}
function fmtBs(n,t){return'Bs '+Math.round((+n||0)*(t||tasas.usd)).toLocaleString('es-VE');}
function fmtEUR(n){return'€'+(tasas.eur?(+n||0)*tasas.usd/tasas.eur:0).toFixed(2);}
function ini(n){return esc((n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join(''));}
function vacio(icono,html){return`<div class="empty"><i class="ti ${icono}"></i>${html}</div>`;}

// Imagen del producto o el icono de su categoría si no hay o falla
function imgProducto(item,clase,claseIcono){
  const icono=getCatIcon(item.categoria||'default');
  return item.imagen_url
    ?`<img class="${clase}" src="${esc(item.imagen_url)}" alt="${esc(item.nombre)}" loading="lazy" onerror="this.outerHTML='<div class=\\'${claseIcono}\\'>${icono}</div>'">`
    :`<div class="${claseIcono}">${icono}</div>`;
}

// Tasas del día (Bs por USD y por EUR)
const tasas={usd:530,eur:0};
async function fetchTasas(){
  try{
    const[rU,rE]=await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/cotizaciones')
    ]);
    if(rU.ok){const d=await rU.json();tasas.usd=parseFloat(d.promedio)||tasas.usd;}
    if(rE.ok){
      const d=await rE.json();
      const e=Array.isArray(d)?d.find(c=>String(c.moneda||'').toUpperCase()==='EUR'):d;
      tasas.eur=parseFloat(e&&e.promedio)||tasas.eur;
    }
  }catch(e){}
}

// GET anónimo a /rest/v1; devuelve lista o null si falla
async function anonGet(path){
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/'+path,{headers:{'apikey':SUPA_KEY,'Accept':'application/json'}});
    return r.ok?await r.json():null;
  }catch(e){return null;}
}
async function anonInsert(tabla,datos){
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/'+tabla,{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify(datos)
    });
    return r.ok;
  }catch(e){return false;}
}

// Copiar al portapapeles con aviso
async function copiar(texto,boton){
  try{await navigator.clipboard.writeText(texto);}
  catch(e){
    const t=document.createElement('textarea');t.value=texto;document.body.appendChild(t);t.select();
    try{document.execCommand('copy');}catch(_){}
    t.remove();
  }
  if(boton){
    const antes=boton.innerHTML;
    boton.innerHTML='<i class="ti ti-check"></i>';boton.classList.add('copiado');
    setTimeout(()=>{boton.innerHTML=antes;boton.classList.remove('copiado');},1500);
  }
}

function aviso(icono,html,ms=4000){
  document.querySelectorAll('.toast.alerta').forEach(x=>x.remove());
  const t=document.createElement('div');
  t.className='toast alerta';
  t.style.top='20px';
  t.innerHTML='<i class="ti '+icono+'"></i><span>'+html+'</span>';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),ms);
}

// Nombre y logo del negocio en la cabecera
function pintarNegocio(s){
  if(!s)return;
  const nombre=s.app_nombre||s.nombre;
  if(nombre){
    const h=document.getElementById('negocio-nombre');if(h)h.textContent=nombre;
    document.title=(document.body.dataset.titulo||'')+nombre;
  }
  if(s.logo_url){
    const img=document.getElementById('negocio-logo');
    if(img){img.onerror=()=>{img.src='icon.svg';};img.src=s.logo_url;}
  }
}
