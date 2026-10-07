// ==========================================================
// Utilidades: formato, iconos, sonidos, avisos y tema
// ==========================================================

// ---- ICONOS DE CATEGORÍA ----
const catIcon={'Ron':'🥃','Cerveza':'🍺','Whisky':'🥃','Vodka':'🍸','Anís':'🌿','Vino':'🍷','Champán':'🍾','Tequila':'🌵','Mezcladores':'🥤','Combos Especiales':'🎉','default':'🍶'};
function getCatIcon(cat){return catIcon[cat]||catIcon['default'];}

// Imagen del producto o, si falla o no hay, el icono de su categoría
function prodImg(item,size='md'){
  const sz=size==='sm'?'prod-img-sm':size==='grid'?'mgi-img':'prod-img';
  const icsz=size==='sm'?'cat-icon-sm':size==='grid'?'mgi-icon':'cat-icon';
  const icono=getCatIcon(item.categoria||'default');
  if(item.imagen_url){
    return`<img class="${sz}" src="${esc(item.imagen_url)}" alt="${esc(item.nombre)}" loading="lazy" onerror="this.outerHTML='<div class=\\'${icsz}\\'>${icono}</div>'">`;
  }
  return`<div class="${icsz}">${icono}</div>`;
}

// ---- TEXTO ----
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function ini(n){return esc((n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join(''));}
function plural(n,s,p){return n===1?s:(p||s+'s');}

// ---- TASAS ----
function tasa(){return parseFloat(document.getElementById('tasa-input')?.value)||tasaBCV;}
function tasaEur(){return parseFloat(document.getElementById('tasa-eur-input')?.value)||tasaEUR;}
function saveTasaEur(){tasaEUR=tasaEur();localStorage.setItem('tasaEur',tasaEUR);renderAll();}
function saveTasa(){tasaBCV=tasa();localStorage.setItem('tasa',tasaBCV);renderAll();}

// ---- FORMATO DE MONTOS ----
function fmtUSD(n){return'$'+(+n||0).toFixed(2);}
function fmtHora(d){return new Date(d).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'});}
function nombreNegocio(){return sucursalActual?.app_nombre||sucursalActual?.nombre||'Mi negocio';}
function fmtBs(n){return'Bs '+Math.round((+n||0)*tasa()).toLocaleString('es-VE');}
function fmtBsCon(n,t){return'Bs '+Math.round((+n||0)*(parseFloat(t)||tasa())).toLocaleString('es-VE');}
function usdAEur(n){const tE=tasaEur();if(!tE)return 0;return(+n||0)*tasa()/tE;}
function fmtEUR(n){return'€'+usdAEur(n).toFixed(2);}
function fmtBsEur(n){return'Bs '+Math.round(usdAEur(n)*tasaEur()).toLocaleString('es-VE');}
function fmtPrice(n){
  if(moneda==='usd')return fmtUSD(n);
  if(moneda==='eur')return fmtEUR(n);
  if(moneda==='bs')return fmtBs(n);
  return fmtUSD(n)+' / '+fmtEUR(n)+' / '+fmtBs(n);
}
function fmtDual(n){
  if(moneda==='usd')return`<span class="precio-uno">${fmtUSD(n)}</span>`;
  if(moneda==='eur')return`<span class="precio-uno">${fmtEUR(n)}</span>`;
  if(moneda==='bs')return`<span class="precio-uno">${fmtBs(n)}</span>`;
  return`<div class="dp"><span class="pusd">${fmtUSD(n)} · ${fmtEUR(n)}</span><span class="pbs">${fmtBs(n)}</span></div>`;
}
// Bloque a la derecha con el monto en USD y su equivalente en Bs (a la tasa indicada)
function montoBloque(usd,t,neutro){
  return`<div class="monto"><div class="monto-usd${neutro?' neutro':''}">${fmtUSD(usd)}</div><div class="monto-bs">${fmtBsCon(usd,t)}</div></div>`;
}
function vacio(msg){return`<div class="nota-vacia">${msg}</div>`;}
function metrica(label,valor,clase='',destacada=false){
  return`<div class="metric${destacada?' destacada':''}"><div class="ml">${label}</div><div class="mv ${clase}">${valor}</div></div>`;
}
// Fila de ranking: posición, nombre, cantidad y monto
function filaRanking(idx,r,conBs=true){
  const medalla=idx===0?'oro':idx===1?'plata':idx===2?'bronce':'';
  return`<div class="res-row">
    <div class="fila crece"><span class="rank ${medalla}">${idx+1}</span>
      <span class="crece recorta"><span class="t-fuerte">${esc(r.nombre)}</span> <span class="t-sub">× ${r.cant}</span></span></div>
    ${conBs?montoBloque(r.total):`<span class="monto-usd">${fmtUSD(r.total)}</span>`}
  </div>`;
}
// Agrupa ítems vendidos por nombre sumando cantidad y total
function agruparItems(items){
  const res={};
  (items||[]).forEach(i=>{
    if(!res[i.nombre])res[i.nombre]={nombre:i.nombre,cant:0,total:0};
    res[i.nombre].cant+=i.consumido;res[i.nombre].total+=i.consumido*i.precio_usd;
  });
  return Object.values(res);
}

// ---- SONIDOS Y VIBRACIÓN ----
function beep(){try{const c=new(window.AudioContext||window.webkitAudioContext)();const o=c.createOscillator();const g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=520;g.gain.setValueAtTime(.12,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.1);o.start();o.stop(c.currentTime+.1);}catch(e){}}
function vibrate(){if(navigator.vibrate)navigator.vibrate(30);}
function feedback(){beep();vibrate();}

function sonidoCaja(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    // Sonido de caja registradora: serie de tonos descendentes + campana
    const notas=[
      {freq:1200,t:0,dur:.06,vol:.3},
      {freq:900,t:.06,dur:.06,vol:.25},
      {freq:600,t:.12,dur:.06,vol:.2},
      {freq:1800,t:.2,dur:.15,vol:.4},  // campana
      {freq:1800,t:.35,dur:.3,vol:.2},  // eco campana
    ];
    notas.forEach(n=>{
      const o=ctx.createOscillator();
      const g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.type=n.freq>1000?'sine':'square';
      o.frequency.value=n.freq;
      g.gain.setValueAtTime(n.vol,ctx.currentTime+n.t);
      g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+n.t+n.dur);
      o.start(ctx.currentTime+n.t);
      o.stop(ctx.currentTime+n.t+n.dur+.05);
    });
  }catch(e){beep();}
  // Vibración de cobro
  if(navigator.vibrate)navigator.vibrate([100,50,100,50,200]);
}

function sonidoAlerta(){
  try{
    const c=new(window.AudioContext||window.webkitAudioContext)();
    [523,659,784].forEach((freq,i)=>{
      const o=c.createOscillator();const g=c.createGain();
      o.connect(g);g.connect(c.destination);
      o.frequency.value=freq;
      g.gain.setValueAtTime(.15,c.currentTime+i*.15);
      g.gain.exponentialRampToValueAtTime(.001,c.currentTime+i*.15+.12);
      o.start(c.currentTime+i*.15);o.stop(c.currentTime+i*.15+.12);
    });
  }catch(e){}
}

// ---- AVISOS ----
function showToast(msg,type='success'){
  const t=document.createElement('div');
  const ok=type==='success';
  t.className='toast '+(ok?'ok':'error');
  t.innerHTML=`<i class="ti ${ok?'ti-circle-check':'ti-alert-circle'}"></i><span></span>`;
  t.querySelector('span').textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),2500);
}
function toastAlerta(html,ms=5000){
  document.querySelectorAll('.toast.alerta').forEach(x=>x.remove());
  const t=document.createElement('div');
  t.className='toast alerta';
  t.innerHTML='<i class="ti ti-alert-triangle"></i><span>'+html+'</span>';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),ms);
}

// ---- ACCIONES EN CURSO ----
// Evita el doble toque: mientras la acción corre, el botón queda
// desactivado con un indicador y una segunda llamada se ignora.
const accionesEnCurso=new Set();
async function enCurso(clave,boton,fn){
  if(accionesEnCurso.has(clave))return;
  accionesEnCurso.add(clave);
  const botones=boton?[boton]:[];
  botones.forEach(b=>{b.disabled=true;b.classList.add('cargando');});
  try{return await fn();}
  finally{
    accionesEnCurso.delete(clave);
    botones.forEach(b=>{b.disabled=false;b.classList.remove('cargando');});
  }
}
// Mensaje legible de un error de Supabase / PostgREST
function msgError(error,porDefecto='Algo salió mal. Intenta de nuevo.'){
  const m=error?.message||'';
  if(!m||/fetch|network|Failed/i.test(m))return navigator.onLine===false?'Sin conexión a internet':porDefecto;
  return m;
}

// ---- MOSTRAR / OCULTAR ----
function $(id){return document.getElementById(id);}
function mostrar(id,v=true,modo='block'){const el=$(id);if(el)el.style.display=v?modo:'none';}
function alternar(id){const el=$(id);const abrir=el.style.display==='none';el.style.display=abrir?'block':'none';return abrir;}
function abrirModal(id){$(id)?.classList.add('open');}
function cerrarModal(id){$(id)?.classList.remove('open');}
// Marca como activo el botón cuyo sufijo coincide
function marcarActivo(prefijo,claves,activa){
  claves.forEach(k=>{const el=$(prefijo+k);if(el)el.classList.toggle('active',k===activa);});
}

// ---- TEMA (oscuro por defecto) ----
function temaClaro(){return document.documentElement.dataset.tema==='claro';}
function applyDark(){
  const b=$('dark-btn');
  if(b)b.innerHTML=temaClaro()?'<i class="ti ti-moon"></i>':'<i class="ti ti-sun"></i>';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',temaClaro()?'#efe8dc':'#110e0c');
}
function toggleDark(){
  if(temaClaro()){delete document.documentElement.dataset.tema;localStorage.setItem('tema','oscuro');}
  else{document.documentElement.dataset.tema='claro';localStorage.setItem('tema','claro');}
  applyDark();
}

// ---- PANTALLA COMPLETA ----
function toggleFullscreen(){
  const btn=$('fs-btn');
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().then(()=>{
      btn.innerHTML='<i class="ti ti-minimize"></i>';
      // Bloquear orientación horizontal en tablet si es posible
      if(screen.orientation&&screen.orientation.lock){
        screen.orientation.lock('landscape').catch(()=>{});
      }
    }).catch(()=>{
      // Si no soporta fullscreen, usar modo kiosco visual
      document.body.classList.add('kiosco');
      btn.innerHTML='<i class="ti ti-minimize"></i>';
    });
  } else {
    document.exitFullscreen().then(()=>{
      btn.innerHTML='<i class="ti ti-maximize"></i>';
      if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock();
    });
  }
}
// Actualizar botón si el usuario sale con Escape
document.addEventListener('fullscreenchange',()=>{
  const btn=$('fs-btn');
  if(btn)btn.innerHTML=document.fullscreenElement?'<i class="ti ti-minimize"></i>':'<i class="ti ti-maximize"></i>';
});

// Cerrar hojas modales tocando el fondo
document.addEventListener('click',e=>{
  if(!e.target.classList?.contains('modal'))return;
  const id=e.target.id;
  if(id==='edit-modal')cerrarEditModal();
  else if(id==='mov-modal')cerrarMovModal();
  else if(id==='hist-modal')cerrarHistModal();
  else if(id==='qr-modal')cerrarQR();
  else e.target.classList.remove('open');
});
