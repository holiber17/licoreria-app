// ==========================================================
// Avisos de los clientes (desde la página del QR):
// "Llamar al mesonero" y "Quiero pagar".
// Necesita la tabla `solicitudes` (supabase/cliente.sql).
// ==========================================================

let solicitudes=[];
let solicitudesVistas=new Set();
let solicitudesActivas=true;   // se apaga si la tabla aún no existe
let solicitudesPrimera=true;
let solicitudesTimer=null;

const SOL_TIPOS={
  mesonero:{icono:'ti-bell-ringing',texto:'Llama al mesonero'},
  pagar:{icono:'ti-wallet',texto:'Quiere pagar'}
};

// Tiempo real: los avisos y los pedidos nuevos llegan al instante.
// Respaldo: si el tiempo real no conecta, se consulta cada 15 s
// (y cada 60 s aunque esté conectado, por si se perdió algún evento).
let canalSucursal=null;
let tiempoRealActivo=false;
let vueltasSolicitudes=0;

function iniciarSolicitudes(){
  if(solicitudesTimer)return;
  cargarSolicitudes();
  iniciarTiempoReal();
  solicitudesTimer=setInterval(()=>{
    vueltasSolicitudes++;
    if(!tiempoRealActivo||vueltasSolicitudes%4===0)cargarSolicitudes();
  },15000);
}

function iniciarTiempoReal(){
  if(!sucursalActual||!sb.channel)return;
  if(canalSucursal){sb.removeChannel(canalSucursal);canalSucursal=null;tiempoRealActivo=false;}
  const f='sucursal_id=eq.'+sucursalActual.id;
  let tPedidos=null;
  const refrescarPedidos=()=>{
    clearTimeout(tPedidos);
    tPedidos=setTimeout(()=>{if($('s-lista')?.classList.contains('active'))renderPedidos();},300);
  };
  try{
    canalSucursal=sb.channel('sucursal-'+sucursalActual.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'solicitudes',filter:f},()=>cargarSolicitudes())
      .on('postgres_changes',{event:'*',schema:'public',table:'pedidos',filter:f},refrescarPedidos)
      .subscribe(estado=>{tiempoRealActivo=estado==='SUBSCRIBED';});
  }catch(e){tiempoRealActivo=false;}
}
// Al cambiar de sucursal
function reiniciarSolicitudes(){
  solicitudes=[];solicitudesVistas=new Set();solicitudesPrimera=true;
  renderSolicitudes();cargarSolicitudes();iniciarTiempoReal();
}

async function cargarSolicitudes(){
  if(!solicitudesActivas||!sucursalActual)return;
  let r;
  try{r=await rest('solicitudes?select=*,pedidos(cliente_nombre,mesa)&sucursal_id=eq.'+sucursalActual.id+'&estado=eq.pendiente&order=created_at.asc');}
  catch(e){return;}
  // 404/400: la tabla todavía no se creó en Supabase. No insistir.
  if(r.status===404||r.status===400){solicitudesActivas=false;renderSolicitudes();return;}
  if(!r.ok)return;
  solicitudes=await r.json();
  const nuevas=solicitudes.filter(s=>!solicitudesVistas.has(s.id));
  nuevas.forEach(s=>solicitudesVistas.add(s.id));
  if(nuevas.length&&!solicitudesPrimera)avisarSolicitudes(nuevas);
  solicitudesPrimera=false;
  renderSolicitudes();
}

function avisarSolicitudes(nuevas){
  sonidoAlerta();
  if(navigator.vibrate)navigator.vibrate([150,80,150]);
  const s=nuevas[nuevas.length-1];
  const t=SOL_TIPOS[s.tipo]||SOL_TIPOS.mesonero;
  const quien=s.pedidos?nombreConMesa(s.pedidos):'Un cliente';
  toastAlerta(`<strong>${esc(quien)}</strong><br>${t.texto}${s.metodo?' · '+esc(s.metodo):''}${s.referencia?' · ref '+esc(s.referencia):''}${nuevas.length>1?`<br><span class="t-mini">y ${nuevas.length-1} aviso(s) más</span>`:''}`,7000);
  if(notifPermiso&&Notification.permission==='granted'){
    new Notification((s.tipo==='pagar'?'💳 ':'🔔 ')+quien,{body:t.texto+(s.metodo?' · '+s.metodo:''),icon:LOGO_URL,tag:'sol_'+s.id});
  }
}

function hace(fecha){
  const min=Math.max(0,Math.round((Date.now()-new Date(fecha))/60000));
  return min<1?'ahora':min===1?'hace 1 min':`hace ${min} min`;
}

function renderSolicitudes(){
  const panel=$('solicitudes-panel');
  const tab=$('gnav-pedidos');
  const n=solicitudes.length;
  tab?.querySelector('.nav-badge')?.remove();
  if(n&&tab){
    const b=document.createElement('span');b.className='nav-badge';b.textContent=n;tab.appendChild(b);
  }
  marcarAvisosEnTarjetas();
  if(!panel)return;
  if(!n){panel.style.display='none';return;}
  panel.style.display='block';
  panel.innerHTML=`<div class="ch"><i class="ti ti-bell-ringing"></i> Avisos de clientes · ${n}</div>`+
    solicitudes.map(s=>{
      const t=SOL_TIPOS[s.tipo]||SOL_TIPOS.mesonero;
      return`<div class="solicitud ${s.tipo}">
        <i class="ti ${t.icono} sol-icono"></i>
        <div class="crece" onclick="abrirPedido('${s.pedido_id}')">
          <div class="t-fuerte recorta">${esc(s.pedidos?nombreConMesa(s.pedidos):'Pedido')}</div>
          <div class="t-sub">${t.texto}${s.metodo?' · '+esc(s.metodo):''}${s.referencia?' · <strong>ref '+esc(s.referencia)+'</strong>':''} · ${hace(s.created_at)}</div>
        </div>
        <button class="btn sm success" onclick="atenderSolicitud('${s.id}')"><i class="ti ti-check"></i> Atendido</button>
      </div>`;
    }).join('');
}

async function atenderSolicitud(id){
  const r=await restPatch('solicitudes',id,{estado:'atendida',atendida_at:new Date().toISOString(),atendida_por:user.id});
  if(!r.ok){showToast('No se pudo marcar como atendido','danger');return;}
  solicitudes=solicitudes.filter(s=>s.id!==id);
  renderSolicitudes();
  feedback();
}

// Marca en la tarjeta de cada pedido si tiene un aviso pendiente
function htmlAvisoTarjeta(pedidoId){
  const tipos=[...new Set(solicitudes.filter(s=>s.pedido_id===pedidoId).map(s=>s.tipo))];
  return tipos.map(t=>t==='pagar'
    ?'<span class="aviso-tarjeta pagar"><i class="ti ti-wallet"></i> Quiere pagar</span>'
    :'<span class="aviso-tarjeta"><i class="ti ti-bell-ringing"></i> Te llama</span>').join('');
}
function marcarAvisosEnTarjetas(){
  document.querySelectorAll('.cli-card[data-pedido]').forEach(card=>{
    const cont=card.querySelector('.avisos-tarjeta');
    if(cont)cont.innerHTML=htmlAvisoTarjeta(card.dataset.pedido);
  });
}
