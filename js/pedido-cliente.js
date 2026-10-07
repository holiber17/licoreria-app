// ==========================================================
// Página pública del pedido (se abre con el QR)
// ==========================================================

const SUPA_URL='https://ysnsmsfeqbnezjgxkkui.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzbnNtc2ZlcWJuZXpqZ3hra3VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDE3NDQsImV4cCI6MjA5NTM3Nzc0NH0.Xn6IwKjoTTRRvuyXIai7tz0iq1rhKEKrs46ZMwLfr3s';
const LOGO_URL=new URL('icon.svg',location.href).href;

const catIcon={'Ron':'🥃','Cerveza':'🍺','Whisky':'🥃','Vodka':'🍸','Anís':'🌿','Vino':'🍷','Champán':'🍾','Tequila':'🌵','Mezcladores':'🥤','default':'🍶'};
function getCatIcon(cat){return catIcon[cat]||catIcon['default'];}

// ID del pedido en la URL
const params=new URLSearchParams(window.location.search);
const pedidoId=params.get('id');

let tasa=530;

async function fetchTasa(){
  try{
    const r=await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if(r.ok){const d=await r.json();tasa=parseFloat(d.promedio)||530;}
  }catch(e){}
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtUSD(n){return'$'+(+n||0).toFixed(2);}
function fmtBs(n,t=tasa){return'Bs '+Math.round((+n||0)*t).toLocaleString('es-VE');}
function ini(n){return esc((n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0].toUpperCase()).join(''));}
function vacio(icono,html){return`<div class="empty"><i class="ti ${icono}"></i>${html}</div>`;}

async function loadPedido(){
  const content=document.getElementById('content');
  if(!pedidoId){
    content.innerHTML=vacio('ti-alert-triangle','Pedido no encontrado.<br>Escanea el QR nuevamente.');
    return;
  }

  try{
    const r=await fetch(SUPA_URL+'/rest/v1/pedidos?select=*,pedido_items(*)&id=eq.'+pedidoId,{
      headers:{'apikey':SUPA_KEY,'Accept':'application/json'}
    });
    if(!r.ok)throw new Error('Error al cargar');
    const pedido=(await r.json())[0];

    if(!pedido){
      content.innerHTML=vacio('ti-receipt-off','Pedido no encontrado.');
      return;
    }

    renderPedido(pedido);
    mostrarNegocio(pedido.sucursal_id);
    checkNotifCliente(pedido.pedido_items||[]);
  }catch(e){
    content.innerHTML=vacio('ti-wifi-off','Error de conexión.<br>Intenta de nuevo.');
  }
}

let negocioMostrado=false;
async function mostrarNegocio(sucursalId){
  if(!sucursalId||negocioMostrado)return;
  try{
    const r=await fetch(SUPA_URL+'/rest/v1/sucursales?select=nombre,app_nombre&id=eq.'+sucursalId,{
      headers:{'apikey':SUPA_KEY,'Accept':'application/json'}
    });
    if(!r.ok)return;
    const d=await r.json();
    const nombre=d[0]&&(d[0].app_nombre||d[0].nombre);
    if(!nombre)return;
    negocioMostrado=true;
    document.getElementById('negocio-nombre').textContent=nombre;
    document.title='Mi pedido — '+nombre;
  }catch(e){}
}

function renderPedido(pedido){
  const items=pedido.pedido_items||[];
  const totalUSD=items.reduce((s,i)=>s+(i.consumido*i.precio_usd),0);
  const cobrado=pedido.estado==='cobrado';
  const tasaPedido=parseFloat(pedido.tasa_bcv)||tasa;

  if(cobrado){
    const badge=document.getElementById('live-badge');
    badge.classList.add('cobrado');
    badge.innerHTML='<i class="ti ti-check"></i> Cobrado';
  }

  let html=`<div class="cliente-header">
    <div class="avatar lg">${ini(pedido.cliente_nombre)}</div>
    <div class="cliente-nombre">${esc(pedido.cliente_nombre)}</div>
    <div class="cliente-sub">${cobrado?'Pedido cerrado':'Pedido activo'}</div>
  </div>`;

  if(cobrado){
    html+=`<div class="cobrado-banner">
      <i class="ti ti-circle-check"></i>
      <p>¡Pedido cerrado!</p>
      ${pedido.nota?`<div class="t-sub" style="color:inherit;margin-top:4px">${esc(pedido.nota)}</div>`:''}
    </div>`;
  }

  // Total arriba: es lo que el cliente busca primero
  html+=`<div class="total-box">
    <div class="total-label">Total a pagar</div>
    <div class="total-usd">${fmtUSD(totalUSD)}</div>
    <div class="total-bs">${fmtBs(totalUSD,tasaPedido)}</div>
  </div>`;

  html+=`<div class="g2">
    <div class="metric"><div class="ml">Ítems pedidos</div><div class="mv">${items.length}</div></div>
    <div class="metric"><div class="ml">Tasa BCV</div><div class="mv sm">${tasaPedido.toFixed(2)}</div></div>
  </div>`;

  if(!items.length){
    html+=vacio('ti-glass','Sin ítems en el pedido.');
  } else {
    html+='<div class="card"><div class="ch"><i class="ti ti-receipt"></i> Detalle del pedido</div>';
    html+=items.map(item=>{
      const esCombo=item.tipo==='combo';
      const restante=item.total-item.consumido;
      const pct=Math.round((item.consumido/item.total)*100);
      const fc=pct>=100?'full':pct>=70?'warn':'';
      const rbClass=pct>=100?'rb-full':pct>=70?'rb-warn':'rb-ok';
      const sub=item.consumido*item.precio_usd;
      const icono=getCatIcon(item.categoria||'default');
      const imgHtml=item.imagen_url
        ?`<img class="prod-img-sm" src="${esc(item.imagen_url)}" alt="${esc(item.nombre)}" onerror="this.outerHTML='<div class=\\'cat-icon-sm\\'>${icono}</div>'">`
        :`<div class="cat-icon-sm">${icono}</div>`;
      return`<div class="item-row">
        ${imgHtml}
        <div class="item-info">
          <div class="item-name">${esc(item.nombre)}</div>
          <div class="item-sub">${esCombo
            ?`<span class="restante-badge ${rbClass}">${restante} de ${item.total} restantes</span>`
            :`${item.consumido} pedida${item.consumido!==1?'s':''}`
          }</div>
          ${esCombo?`<div class="prog-bar"><div class="prog-fill ${fc}" style="width:${pct}%"></div></div>`:''}
        </div>
        <div class="monto">
          <div class="monto-usd neutro">${fmtUSD(sub)}</div>
          <div class="monto-bs">${fmtBs(sub)}</div>
        </div>
      </div>`;
    }).join('');
    html+='</div>';
  }

  document.getElementById('content').innerHTML=html;
}

// ---- NOTIFICACIONES ----
let notifPermiso = false;
let notificadosYa = new Set(JSON.parse(sessionStorage.getItem('notif_'+pedidoId)||'[]'));
function saveNotif(){sessionStorage.setItem('notif_'+pedidoId,JSON.stringify([...notificadosYa]));}

async function pedirPermiso(){
  if(!('Notification' in window))return;
  if(Notification.permission==='granted'){notifPermiso=true;return;}
  if(Notification.permission!=='denied'){
    const p = await Notification.requestPermission();
    notifPermiso = p==='granted';
  }
}

function alertaSonido(){
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
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
}

function toastCliente(icono,html){
  const t=document.createElement('div');
  t.className='toast alerta';
  t.style.top='20px';
  t.innerHTML='<i class="ti '+icono+'"></i><span>'+html+'</span>';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),6000);
}

function checkNotifCliente(items){
  items.forEach(item=>{
    if(item.tipo!=='combo')return;
    const restante=item.total-item.consumido;
    const key=item.id+'_ultima';
    if(restante===1 && !notificadosYa.has(key)){
      notificadosYa.add(key);saveNotif();
      alertaSonido();
      toastCliente('ti-alert-triangle','¡Última unidad de<br><strong>'+esc(item.nombre)+'</strong>!');
      if(notifPermiso){
        new Notification('⚠️ ¡Última unidad!',{
          body:'Solo queda 1 '+item.unidad+' de '+item.nombre,
          icon:LOGO_URL,
          tag:key,
          requireInteraction:true
        });
      }
    }
    const keyFull=item.id+'_agotado';
    if(restante===0 && !notificadosYa.has(keyFull)){
      notificadosYa.add(keyFull);saveNotif();
      alertaSonido();
      toastCliente('ti-ban','Se agotó<br><strong>'+esc(item.nombre)+'</strong>');
      if(notifPermiso){
        new Notification('🚫 Se agotó el combo',{
          body:item.nombre+' — no quedan unidades',
          icon:LOGO_URL,
          tag:keyFull,
          requireInteraction:true
        });
      }
    }
  });
}

// Iniciar
pedirPermiso();
fetchTasa().then(loadPedido);

// Actualizar cada 10 segundos
setInterval(async()=>{
  await fetchTasa();
  await loadPedido();
}, 10000);
