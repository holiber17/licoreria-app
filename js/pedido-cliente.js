// ==========================================================
// Página pública del pedido (se abre con el QR):
// consumo en vivo, cómo pagar y llamar al mesonero.
// ==========================================================

const pedidoId=params.get('id');
let pedidoCache=null;
let sucursal=null;
let partes=1;
let metodoElegido='';
let referenciaPago='';     // referencia del pago que escribe el cliente (opcional)
let catalogo={};           // menu_id / nombre -> {categoria, imagen_url}
let avisos=[];             // avisos de este pedido (últimas 12 h)
let estadoAvisoAnterior={};
let tiempoReal=false;

// ---- DATOS DEL NEGOCIO ----
async function cargarNegocio(sucursalId){
  if(sucursal||!sucursalId)return;
  const id=encodeURIComponent(sucursalId);
  // datos_pago existe solo después de correr supabase/cliente.sql
  let d=await anonGet('sucursales?select=id,nombre,app_nombre,logo_url,datos_pago&id=eq.'+id);
  if(d===null)d=await anonGet('sucursales?select=id,nombre,app_nombre,logo_url&id=eq.'+id);
  if(!d||!d[0])return;
  sucursal=d[0];
  pintarNegocio(sucursal);
  // Categoría e imagen de cada producto, para mostrar su ícono
  const menu=await anonGet('menu?select=id,nombre,categoria,imagen_url&sucursal_id=eq.'+id);
  (menu||[]).forEach(m=>{catalogo[m.id]=m;catalogo['n:'+m.nombre.toLowerCase()]=m;});
}
function conCatalogo(item){
  const m=catalogo[item.menu_id]||catalogo['n:'+String(item.nombre||'').toLowerCase()];
  return m?{...item,categoria:m.categoria,imagen_url:item.imagen_url||m.imagen_url}:item;
}

// Métodos de pago que el negocio configuró, más efectivo
const METODOS=[
  {clave:'pago_movil',nombre:'Pago móvil',icono:'ti-device-mobile',campos:[['banco','Banco'],['telefono','Teléfono'],['cedula','Cédula / RIF']],bs:true},
  {clave:'transferencia',nombre:'Transferencia',icono:'ti-arrows-exchange',campos:[['banco','Banco'],['cuenta','Cuenta'],['titular','Titular'],['cedula','Cédula / RIF']],bs:true},
  {clave:'zelle',nombre:'Zelle',icono:'ti-building-bank',campos:[['correo','Correo'],['titular','Titular']],bs:false},
  {clave:'efectivo',nombre:'Efectivo',icono:'ti-cash',campos:[],bs:false},
];
function metodosDisponibles(){
  const dp=sucursal?.datos_pago||{};
  return METODOS.filter(m=>m.clave==='efectivo'||Object.values(dp[m.clave]||{}).some(v=>String(v||'').trim()));
}

// ---- CARGA Y PINTADO ----
async function loadPedido(){
  const content=document.getElementById('content');
  if(!pedidoId){
    content.innerHTML=vacio('ti-alert-triangle','Pedido no encontrado.<br>Escanea el QR nuevamente.');
    return;
  }
  const data=await anonGet('pedidos?select=*,pedido_items(*)&id=eq.'+encodeURIComponent(pedidoId));
  if(data===null){
    if(!pedidoCache)content.innerHTML=vacio('ti-wifi-off','Error de conexión.<br>Intenta de nuevo.');
    return;
  }
  const pedido=data[0];
  if(!pedido){content.innerHTML=vacio('ti-receipt-off','Pedido no encontrado.');return;}
  pedidoCache=pedido;
  await cargarNegocio(pedido.sucursal_id);
  avisos=await anonGet('solicitudes?select=id,tipo,estado,created_at,atendida_at&pedido_id=eq.'+encodeURIComponent(pedidoId)+'&order=created_at.desc&limit=10')||[];
  avisarSiAtendieron();
  renderPedido(pedido);
  checkNotifCliente(pedido.pedido_items||[]);
  if(document.getElementById('hoja-pago').classList.contains('open'))renderPago();
}

function totalPedido(p){return(p.pedido_items||[]).reduce((s,i)=>s+(i.consumido*i.precio_usd),0);}

function renderPedido(pedido){
  const items=pedido.pedido_items||[];
  const totalUSD=totalPedido(pedido);
  const cobrado=pedido.estado==='cobrado';
  const abierto=pedido.estado==='abierto';
  const tasaPedido=parseFloat(pedido.tasa_bcv)||tasas.usd;

  const badge=document.getElementById('live-badge');
  if(cobrado){badge.classList.add('cobrado');badge.innerHTML='<i class="ti ti-check"></i> Cobrado';}
  else if(!abierto){badge.classList.add('cobrado');badge.innerHTML='Cerrado';}

  let html=`<div class="cliente-header">
    <div class="avatar lg">${ini(pedido.cliente_nombre)}</div>
    <div class="cliente-nombre">${esc(pedido.cliente_nombre)}</div>
    <div class="cliente-sub">${pedido.mesa?'Mesa '+esc(String(pedido.mesa).replace(/^mesa\s+/i,''))+' · ':''}${abierto?'Pedido activo':'Pedido cerrado'}</div>
  </div>`;

  if(cobrado){
    html+=`<div class="cobrado-banner">
      <i class="ti ti-circle-check"></i>
      <p>¡Gracias por tu visita!</p>
      ${pedido.nota?`<div class="t-sub" style="color:inherit;margin-top:4px">${esc(pedido.nota)}</div>`:''}
    </div>`;
  }

  html+=`<div class="total-box">
    <div class="total-label">${cobrado?'Total pagado':'Total hasta ahora'}</div>
    <div class="total-usd">${fmtUSD(totalUSD)}</div>
    <div class="total-bs">${fmtBs(totalUSD,tasaPedido)}</div>
  </div>`;

  if(abierto)html+=htmlEstadoAvisos();

  if(abierto){
    html+=`<div class="acciones-cliente">
      <button class="btn grande" id="btn-mesonero" onclick="llamarMesonero()"><i class="ti ti-bell-ringing"></i> Llamar al mesonero</button>
      <button class="btn primary grande" onclick="abrirPago()"><i class="ti ti-wallet"></i> Quiero pagar</button>
    </div>`;
  }

  if(!items.length){
    html+=vacio('ti-glass','Todavía no hay nada en tu pedido.');
  } else {
    html+=`<div class="card"><div class="ch"><i class="ti ti-receipt"></i> Lo que llevas · ${items.length} ${items.length===1?'producto':'productos'}</div>`;
    html+=items.map(item=>{
      const esCombo=item.tipo==='combo';
      const restante=item.total-item.consumido;
      const pct=item.total>0?Math.round((item.consumido/item.total)*100):0;
      const fc=pct>=100?'full':pct>=70?'warn':'';
      const rbClass=pct>=100?'rb-full':pct>=70?'rb-warn':'rb-ok';
      const sub=item.consumido*item.precio_usd;
      return`<div class="item-row">
        ${imgProducto(conCatalogo(item),'prod-img-sm','cat-icon-sm')}
        <div class="item-info">
          <div class="item-name">${esc(item.nombre)}</div>
          <div class="item-sub">${esCombo
            ?`<span class="restante-badge ${rbClass}">${restante>0?`Te ${restante===1?'queda':'quedan'} ${restante} de ${item.total}`:'Combo terminado'}</span>`
            :`${item.consumido} ${esc(item.unidad)}${item.consumido!==1?'s':''}`
          }</div>
          ${esCombo?`<div class="prog-bar"><div class="prog-fill ${fc}" style="width:${pct}%"></div></div>`:''}
        </div>
        <div class="monto">
          <div class="monto-usd neutro">${fmtUSD(sub)}</div>
          <div class="monto-bs">${fmtBs(sub,tasaPedido)}</div>
        </div>
      </div>`;
    }).join('');
    html+='</div>';
  }

  html+=`<div class="pie-tasa">Tasa BCV del pedido: Bs ${tasaPedido.toFixed(2)} por $</div>`;
  if(pedido.sucursal_id){
    html+=`<a class="btn full" href="carta.html?s=${encodeURIComponent(pedido.sucursal_id)}"><i class="ti ti-book"></i> Ver la carta y precios</a>`;
  }

  document.getElementById('content').innerHTML=html;
  actualizarEspera();
}

// ---- ESTADO DE LOS AVISOS ("Ya vienen") ----
function ultimoAviso(tipo){return avisos.find(a=>a.tipo===tipo);}
function minutosDesde(f){return Math.max(0,Math.round((Date.now()-new Date(f))/60000));}
function htmlEstadoAvisos(){
  const filas=[];
  const m=ultimoAviso('mesonero'), p=ultimoAviso('pagar');
  if(m&&m.estado==='pendiente')filas.push(['espera','ti-bell-ringing',`Le avisamos al mesonero${minutosDesde(m.created_at)?` · hace ${minutosDesde(m.created_at)} min`:''}`]);
  else if(m&&m.estado==='atendida'&&minutosDesde(m.atendida_at||m.created_at)<10)filas.push(['ok','ti-walk','¡Ya vienen! El mesonero vio tu llamado']);
  if(p&&p.estado==='pendiente')filas.push(['espera','ti-wallet','Avisaste que vas a pagar · un mesonero viene a confirmar']);
  else if(p&&p.estado==='atendida'&&minutosDesde(p.atendida_at||p.created_at)<15)filas.push(['ok','ti-circle-check','Un mesonero viene a confirmar tu pago']);
  return filas.map(([c,i,t])=>`<div class="estado-aviso ${c}"><i class="ti ${i}"></i><span>${t}</span></div>`).join('');
}
// Cuando un aviso pasa de pendiente a atendido, avisar al cliente
function avisarSiAtendieron(){
  avisos.forEach(a=>{
    const antes=estadoAvisoAnterior[a.id];
    if(antes==='pendiente'&&a.estado==='atendida'){
      if(navigator.vibrate)navigator.vibrate([80,40,80]);
      aviso('ti-walk',a.tipo==='pagar'?'Un mesonero viene a confirmar tu pago':'¡Ya vienen!');
    }
    estadoAvisoAnterior[a.id]=a.estado;
  });
}

// ---- TIEMPO REAL ----
// Si el tiempo real de Supabase está disponible, la página se actualiza
// al instante; si no, sigue consultando cada 10 segundos.
function iniciarTiempoReal(){
  if(!window.supabase||!pedidoId)return;
  try{
    const cli=window.supabase.createClient(SUPA_URL,SUPA_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    let t=null;
    const refrescar=()=>{clearTimeout(t);t=setTimeout(loadPedido,250);};
    const f='pedido_id=eq.'+pedidoId;
    cli.channel('pedido-'+pedidoId)
      .on('postgres_changes',{event:'*',schema:'public',table:'pedido_items',filter:f},refrescar)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'pedidos',filter:'id=eq.'+pedidoId},refrescar)
      .on('postgres_changes',{event:'*',schema:'public',table:'solicitudes',filter:f},refrescar)
      .subscribe(estado=>{tiempoReal=estado==='SUBSCRIBED';});
  }catch(e){tiempoReal=false;}
}

// ---- SOLICITUDES AL PERSONAL ----
const ESPERA_MS=60*1000;
function claveEspera(tipo){return'sol_'+pedidoId+'_'+tipo;}
function enEspera(tipo){
  try{return Date.now()-parseInt(localStorage.getItem(claveEspera(tipo))||'0')<ESPERA_MS;}catch(e){return false;}
}
function actualizarEspera(){
  const b=document.getElementById('btn-mesonero');
  if(!b)return;
  const pendiente=ultimoAviso('mesonero')?.estado==='pendiente';
  if(enEspera('mesonero')||pendiente){b.disabled=true;b.innerHTML='<i class="ti ti-check"></i> Ya le avisamos';}
}

async function enviarSolicitud(tipo,metodo,referencia){
  if(!pedidoCache||pedidoCache.estado!=='abierto')return false;
  if(enEspera(tipo)){aviso('ti-clock','Ya avisamos al personal.<br>En un momento te atienden.');return false;}
  const base={sucursal_id:pedidoCache.sucursal_id,pedido_id:pedidoCache.id,tipo,metodo:metodo||null};
  let ok=await anonInsert('solicitudes',referencia?{...base,referencia}:base);
  // Si la columna `referencia` aún no existe (supabase/ajustes_mesonero.sql),
  // el aviso se envía igual con la referencia dentro del texto del método.
  if(!ok&&referencia)ok=await anonInsert('solicitudes',{...base,metodo:((metodo||'Pago')+' · ref '+referencia).slice(0,40)});
  if(!ok){aviso('ti-alert-triangle','No pudimos enviar el aviso.<br>Por favor llama a un mesonero.');return false;}
  try{localStorage.setItem(claveEspera(tipo),String(Date.now()));}catch(e){}
  if(navigator.vibrate)navigator.vibrate(40);
  return true;
}

async function llamarMesonero(){
  pedirPermiso();
  const b=document.getElementById('btn-mesonero');
  if(b)b.disabled=true;
  if(await enviarSolicitud('mesonero')){
    aviso('ti-bell-ringing','¡Listo! Le avisamos al mesonero.');
    loadPedido();
    setTimeout(()=>{const x=document.getElementById('btn-mesonero');if(x){x.disabled=false;x.innerHTML='<i class="ti ti-bell-ringing"></i> Llamar al mesonero';}},ESPERA_MS);
  } else if(b&&!enEspera('mesonero')) b.disabled=false;
}

// ---- HOJA DE PAGO ----
function abrirPago(){
  pedirPermiso();
  partes=1;
  const disp=metodosDisponibles();
  metodoElegido=disp.length===1?disp[0].clave:(disp.find(m=>m.clave!=='efectivo')?.clave||'efectivo');
  renderPago();
  document.getElementById('hoja-pago').classList.add('open');
}
function cerrarPago(){document.getElementById('hoja-pago').classList.remove('open');}
function setPartes(n){partes=Math.max(1,Math.min(20,n));renderPago();}
function setMetodo(m){metodoElegido=m;renderPago();}

function filaCopiable(etiqueta,valor){
  return`<div class="dato-pago"><div class="crece"><div class="t-mini">${etiqueta}</div><div class="t-fuerte">${esc(valor)}</div></div>
    <button class="btn sm ico" onclick="copiar(decodeURIComponent('${encodeURIComponent(valor)}'),this)" aria-label="Copiar ${etiqueta}"><i class="ti ti-copy"></i></button></div>`;
}

function renderPago(){
  if(!pedidoCache)return;
  const total=totalPedido(pedidoCache);
  const tasaPedido=parseFloat(pedidoCache.tasa_bcv)||tasas.usd;
  const porPersona=total/partes;
  const montoBs=Math.round(porPersona*tasaPedido);
  const disp=metodosDisponibles();
  const m=METODOS.find(x=>x.clave===metodoElegido)||METODOS[3];
  const datos=(sucursal?.datos_pago||{})[m.clave]||{};

  let html=`<div class="pago-total">
      <div class="t-mini">${partes>1?`Cada persona paga (entre ${partes})`:'Total a pagar'}</div>
      <div class="pago-usd">${fmtUSD(porPersona)}</div>
      <div class="pago-bs">Bs ${montoBs.toLocaleString('es-VE')}</div>
    </div>
    <div class="dividir">
      <span><i class="ti ti-users"></i> Dividir la cuenta</span>
      <div class="contador">
        <button class="cbtn" onclick="setPartes(partes-1)" aria-label="Menos personas">−</button>
        <span class="cval">${partes}</span>
        <button class="cbtn" onclick="setPartes(partes+1)" aria-label="Más personas">+</button>
      </div>
    </div>
    <div class="ch mt-m"><i class="ti ti-credit-card"></i> ¿Cómo vas a pagar?</div>
    <div class="metodos">${disp.map(x=>`<button class="metodo-btn ${x.clave===m.clave?'active':''}" onclick="setMetodo('${x.clave}')"><i class="ti ${x.icono}"></i> ${x.nombre}</button>`).join('')}</div>`;

  const campos=m.campos.filter(([k])=>String(datos[k]||'').trim());
  if(campos.length){
    html+=`<div class="datos-pago">`+campos.map(([k,et])=>filaCopiable(et,String(datos[k]).trim())).join('');
    if(m.bs)html+=filaCopiable('Monto en Bs',String(montoBs));
    else html+=filaCopiable('Monto en $',porPersona.toFixed(2));
    html+=`</div>`;
  } else if(m.clave==='efectivo'){
    html+=`<p class="t-sub mt-m">Paga en efectivo directamente al personal. Avísales para que te traigan la cuenta.</p>`;
  }

  if(m.clave!=='efectivo'){
    html+=`<div class="fg mt-m"><label for="ref-pago">Referencia del pago (opcional)</label>
      <input id="ref-pago" inputmode="numeric" maxlength="20" autocomplete="off" placeholder="Número de referencia o últimos dígitos" value="${esc(referenciaPago)}" oninput="referenciaPago=limpiarReferencia(this.value)"></div>
      <p class="t-mini">Si ya pagaste, escríbela y el mesonero verifica más rápido.</p>`;
  }
  html+=`<button class="btn primary full grande mt-m" id="btn-avisar-pago" onclick="avisarPago()"><i class="ti ti-send"></i> Avisar mi pago</button>
    <p class="t-mini mt-s" style="text-align:center">Un mesonero confirmará tu pago antes de cerrar la cuenta.</p>`;
  document.getElementById('pago-cuerpo').innerHTML=html;
  if(enEspera('pagar')){const b=document.getElementById('btn-avisar-pago');b.disabled=true;b.innerHTML='<i class="ti ti-check"></i> Ya avisamos al personal';}
}

function limpiarReferencia(v){return String(v||'').replace(/[^A-Za-z0-9-]/g,'').slice(0,20);}

async function avisarPago(){
  const b=document.getElementById('btn-avisar-pago');
  b.disabled=true;
  const m=METODOS.find(x=>x.clave===metodoElegido);
  const detalle=(m?.nombre||'')+(partes>1?` · entre ${partes}`:'');
  const ref=m&&m.clave!=='efectivo'?limpiarReferencia(referenciaPago):'';
  if(await enviarSolicitud('pagar',detalle,ref)){
    b.innerHTML='<i class="ti ti-check"></i> Ya avisamos al personal';
    aviso('ti-wallet','¡Listo! Ya le avisamos al personal.<br>En un momento confirman tu pago.');
    loadPedido();
  } else if(!enEspera('pagar')) b.disabled=false;
}

// ---- NOTIFICACIONES DE COMBOS ----
let notifPermiso = false;
let notificadosYa = new Set(JSON.parse(sessionStorage.getItem('notif_'+pedidoId)||'[]'));
function saveNotif(){sessionStorage.setItem('notif_'+pedidoId,JSON.stringify([...notificadosYa]));}

async function pedirPermiso(){
  if(!('Notification' in window)||notifPermiso)return;
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

function checkNotifCliente(items){
  items.forEach(item=>{
    if(item.tipo!=='combo')return;
    const restante=item.total-item.consumido;
    const key=item.id+'_ultima';
    if(restante===1 && !notificadosYa.has(key)){
      notificadosYa.add(key);saveNotif();
      alertaSonido();
      aviso('ti-alert-triangle','¡Última unidad de<br><strong>'+esc(item.nombre)+'</strong>!',6000);
      if(notifPermiso){
        new Notification('⚠️ ¡Última unidad!',{body:'Solo queda 1 '+item.unidad+' de '+item.nombre,icon:LOGO_URL,tag:key,requireInteraction:true});
      }
    }
    const keyFull=item.id+'_agotado';
    if(restante===0 && !notificadosYa.has(keyFull)){
      notificadosYa.add(keyFull);saveNotif();
      alertaSonido();
      aviso('ti-ban','Se terminó tu combo<br><strong>'+esc(item.nombre)+'</strong>',6000);
      if(notifPermiso){
        new Notification('🚫 Se terminó el combo',{body:item.nombre+' — no quedan unidades',icon:LOGO_URL,tag:keyFull,requireInteraction:true});
      }
    }
  });
}

// Cerrar la hoja tocando el fondo
document.getElementById('hoja-pago').addEventListener('click',e=>{if(e.target.id==='hoja-pago')cerrarPago();});

// Iniciar (el permiso de notificaciones se pide al tocar un botón, no al abrir)
if('Notification' in window&&Notification.permission==='granted')notifPermiso=true;
fetchTasas().then(loadPedido);
iniciarTiempoReal();

// Respaldo: cada 10 s sin tiempo real; cada 60 s con tiempo real (tasa y borrados)
let vueltas=0;
setInterval(async()=>{
  vueltas++;
  if(tiempoReal&&vueltas%6!==0)return;
  await fetchTasas();
  await loadPedido();
}, 10000);
