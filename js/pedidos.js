// ==========================================================
// Pedidos: tasas, navegación, pedidos abiertos, consumo y cobro
// ==========================================================

// ---- NOTIFICACIONES ----
let notifPermiso = false;
let notificadosHoy = new Set(JSON.parse(localStorage.getItem('notif_hoy')||'[]'));

async function pedirPermisoNotif(){
  if(!('Notification' in window))return;
  if(Notification.permission === 'granted'){notifPermiso=true;return;}
  if(Notification.permission !== 'denied'){
    const perm = await Notification.requestPermission();
    notifPermiso = perm === 'granted';
  }
}

function notifUltimaUnidad(itemNombre, pedidoNombre){
  const key = itemNombre+'|'+pedidoNombre;
  if(notificadosHoy.has(key))return;
  notificadosHoy.add(key);
  localStorage.setItem('notif_hoy', JSON.stringify([...notificadosHoy]));

  sonidoAlerta();
  if(navigator.vibrate)navigator.vibrate([200,100,200]);
  toastAlerta('<strong>'+esc(itemNombre)+'</strong><br>¡Última unidad! ('+esc(pedidoNombre)+')');

  if(notifPermiso && Notification.permission==='granted'){
    new Notification('⚠️ Última unidad', {
      body: itemNombre+' — queda 1 unidad ('+pedidoNombre+')',
      icon: LOGO_URL,
      badge: LOGO_URL,
      tag: key,
      requireInteraction: true
    });
  }
}

function checkNotificaciones(){
  if(!pedidoActual)return;
  (pedidoActual.pedido_items||[]).forEach(item=>{
    if(item.tipo==='combo' && (item.total - item.consumido) === 1){
      notifUltimaUnidad(item.nombre, pedidoActual.cliente_nombre);
    }
  });
}

// ---- MONEDA ----
function setMoneda(m){moneda=m;localStorage.setItem('moneda',m);marcarActivo('m-',['usd','eur','bs','both'],m);renderAll();}

// ---- TASA BCV ----
async function fetchBCV(){
  const b=$('tbadge');if(!b)return;
  b.className='tbadge loading';b.innerHTML='<i class="ti ti-refresh"></i> Cargando...';
  try{
    // USD y EUR en paralelo
    const[rUSD,rEUR]=await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/cotizaciones')
    ]);
    if(!rUSD.ok)throw new Error();
    const dUSD=await rUSD.json();
    const tUSD=parseFloat(dUSD.promedio);if(!tUSD||isNaN(tUSD))throw new Error();
    $('tasa-input').value=tUSD.toFixed(2);
    tasaBCV=tUSD;localStorage.setItem('tasa',tUSD);

    if(rEUR.ok){
      const dEUR=await rEUR.json();
      const cEUR=Array.isArray(dEUR)?dEUR.find(c=>String(c.moneda||'').toUpperCase()==='EUR'):dEUR;
      const tEUR=parseFloat(cEUR&&cEUR.promedio);
      if(tEUR&&!isNaN(tEUR)){
        $('tasa-eur-input').value=tEUR.toFixed(2);
        tasaEUR=tEUR;localStorage.setItem('tasaEur',tEUR);
      }
    }

    const fecha=dUSD.fechaActualizacion?new Date(dUSD.fechaActualizacion).toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit'}):'';
    b.className='tbadge';b.innerHTML=`<i class="ti ti-check"></i> BCV${fecha?' · '+fecha:''}`;
    renderAll();
    guardarTasaHoy();
  }catch(e){b.className='tbadge error';b.innerHTML='<i class="ti ti-wifi-off"></i> Manual';}
}

async function guardarTasaHoy(){
  if(!sucursalActual)return;
  await rest('tasas_bcv',{method:'POST',prefer:'resolution=merge-duplicates',
    body:{sucursal_id:sucursalActual.id,tasa:tasa(),fecha:new Date().toISOString().split('T')[0]}});
}

// ---- NAVEGACIÓN ----
function switchGNav(sec){
  ['pedidos','menu','caja','admin','inventario','actividad','clientes'].forEach(s=>{
    const t=$('gnav-'+s),c=$('sec-'+s);
    if(t)t.classList.toggle('active',s===sec);
    if(c)c.classList.toggle('active',s===sec);
  });
  $('gnav-'+sec)?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
  if(sec==='menu'){loadMenu().then(renderMenu);}
  if(sec==='caja')renderCaja();
  if(sec==='admin')loadAdmin();
  if(sec==='actividad')renderMiActividad();
  if(sec==='inventario'){loadInventario();}
  if(sec==='clientes'){loadClientes();}
}
function goLista(){showScr('s-lista');renderPedidos();}
function showScr(id){document.querySelectorAll('#sec-pedidos .scr').forEach(s=>s.classList.remove('active'));$(id).classList.add('active');}
function renderAll(){renderPedidos();if(pedidoActual){renderConsumo();renderCuenta();}renderMenu();renderCaja();}

// ---- NUEVO PEDIDO ----
function buscarClienteSugerido(){
  const q=$('nuevo-nombre').value.trim().toLowerCase();
  const sug=$('cliente-sugeridos');
  if(!q||q.length<2||!clientesList.length){sug.style.display='none';return;}
  const matches=clientesList.filter(c=>c.nombre.toLowerCase().includes(q)).slice(0,4);
  if(!matches.length){sug.style.display='none';return;}
  sug.style.display='block';
  sug.innerHTML=matches.map(c=>`<div class="sugerencia" onclick="seleccionarCliente('${c.id}')">
    <div class="avatar sm">${ini(c.nombre)}</div>
    <div><div class="t-fuerte">${esc(c.nombre)}</div><div class="t-mini">${esc(c.telefono||'Sin teléfono')}</div></div>
  </div>`).join('');
}

function seleccionarCliente(clienteId){
  const c=clientesList.find(x=>x.id===clienteId);
  if(!c)return;
  $('nuevo-nombre').value=c.nombre;
  $('cliente-sugeridos').style.display='none';
}

function toggleNuevo(){if(alternar('form-nuevo'))$('nuevo-nombre').focus();}

async function crearPedido(){
  const n=$('nuevo-nombre').value.trim();
  if(!n){alert('Escribe un nombre');return;}
  const{data,error}=await sb.from('pedidos').insert({sucursal_id:sucursalActual.id,usuario_id:user.id,cliente_nombre:n,estado:'abierto',tasa_bcv:tasa()}).select().single();
  if(error){showToast('Error al crear pedido','danger');return;}
  $('nuevo-nombre').value='';
  mostrar('form-nuevo',false);
  pedidoActual=data;pedidoActual.pedido_items=[];
  await abrirPedido(data.id);
}

// ---- LISTA DE PEDIDOS ----
async function renderPedidos(){
  if(!sucursalActual)return;
  const q=($('buscador')?.value||'').toLowerCase();
  const pedidos=await restGet('pedidos?select=*,pedido_items(*)&sucursal_id=eq.'+sucursalActual.id+'&estado=eq.abierto&order=created_at.desc');
  const el=$('pedidos-list');if(!el)return;
  const lista=(pedidos||[]).filter(p=>p.cliente_nombre.toLowerCase().includes(q));
  if(!lista.length){el.innerHTML='<div class="empty"><i class="ti ti-glass-full"></i>Sin pedidos activos.<br>Toca <strong>Nuevo</strong> para abrir uno.</div>';return;}
  el.innerHTML='<div class="lista-pedidos">'+lista.map(p=>{
    const items=p.pedido_items||[];
    const total=items.reduce((s,i)=>s+(i.consumido*i.precio_usd),0);
    return`<div class="cli-card activo" onclick="abrirPedido('${p.id}')">
      <div class="fila">
        <div class="avatar sm">${ini(p.cliente_nombre)}</div>
        <span class="nombre recorta crece">${esc(p.cliente_nombre)}</span>
      </div>
      <div class="pedido-total">${fmtDual(total)}</div>
      <div class="t-mini mt-s"><i class="ti ti-clock"></i> ${fmtHora(p.created_at)} · ${items.length} ${plural(items.length,'ítem')}</div>
    </div>`;
  }).join('')+'</div>';
}

async function abrirPedido(id){
  const{data}=await sb.from('pedidos').select('*,pedido_items(*)').eq('id',id).single();
  pedidoActual=data;
  $('det-nombre').textContent=data.cliente_nombre;
  $('det-avatar').innerHTML=ini(data.cliente_nombre);
  $('nota-cobro').value='';
  showScr('s-detalle');switchTab('consumo');
}
async function cancelarPedido(){
  if(!pedidoActual)return;
  if(!confirm('¿Cancelar el pedido sin cobrar?'))return;
  await sb.from('pedidos').update({estado:'cancelado'}).eq('id',pedidoActual.id);
  pedidoActual=null;goLista();
}
// El cobro ocurre entero dentro de Supabase (función cobrar_pedido):
// cierra el pedido, registra en caja y descuenta el stock en una sola
// operación. Si se toca dos veces, la segunda falla con "ya fue cobrado".
async function cobrarPedido(boton){
  if(!pedidoActual||accionesEnCurso.has('cobrar'))return;
  const items=(pedidoActual.pedido_items||[]).filter(i=>i.consumido>0);
  if(!items.length){alert('No hay nada consumido aún.');return;}
  const total=items.reduce((s,i)=>s+(i.consumido*i.precio_usd),0);
  const nota=$('nota-cobro').value.trim();
  if(!confirm(`¿Cobrar ${fmtUSD(total)} (${fmtBs(total)}) a ${pedidoActual.cliente_nombre}?`))return;
  const botones=[...document.querySelectorAll('[data-accion="cobrar"]')];
  botones.forEach(b=>{b.disabled=true;b.classList.add('cargando');});
  await enCurso('cobrar',null,async()=>{
    const{data,error}=await sb.rpc('cobrar_pedido',{p_pedido:pedidoActual.id,p_metodo:metodoPago,p_nota:nota,p_tasa:tasa()});
    if(error){
      showToast(msgError(error,'No se pudo cobrar. Intenta de nuevo.'),'danger');
      // Si ya estaba cobrado (p. ej. desde otro teléfono), volver a la lista
      if(/ya fue cobrado/i.test(error.message||'')){pedidoActual=null;goLista();}
      return;
    }
    sonidoCaja();showToast(`Cobrado ${fmtUSD(data?.total_usd??total)} ✓`);
    pedidoActual=null;goLista();switchGNav('caja');
    if(invItems.length)loadInventario();
  }).finally(()=>botones.forEach(b=>{b.disabled=false;b.classList.remove('cargando');}));
}

// ---- QR ----
function mostrarQR(){
  if(!pedidoActual)return;
  const url=new URL('pedido.html?id='+pedidoActual.id, location.href).href;
  $('qr-url').textContent=url;
  $('qr-container').innerHTML='<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+encodeURIComponent(url)+'" alt="QR">';
  abrirModal('qr-modal');
}
function cerrarQR(){cerrarModal('qr-modal');}

// ---- PESTAÑAS DEL PEDIDO ----
function switchTab(tab){
  ['consumo','agregar','cuenta'].forEach(t=>{mostrar('mt-'+t,t===tab);$('tab-'+t).classList.toggle('active',t===tab);});
  if(tab==='consumo')renderConsumo();
  if(tab==='agregar')renderMenuPicks();
  if(tab==='cuenta')renderCuenta();
}

// ---- AGREGAR AL PEDIDO ----
function renderMenuPicks(){
  const el=$('menu-picks');
  if(!menuItems.length){el.innerHTML='<div class="empty"><i class="ti ti-bottle"></i>Menú vacío.</div>';return;}
  const q=($('menu-search')?.value||'').toLowerCase();
  const filtrado=menuItems.filter(m=>m.nombre.toLowerCase().includes(q)||m.categoria?.toLowerCase().includes(q));
  const cats=[...new Set(filtrado.map(m=>m.categoria||'General'))];
  let html='';
  cats.forEach(cat=>{
    const items=filtrado.filter(m=>(m.categoria||'General')===cat);
    html+=`<div class="slabel">${getCatIcon(cat)} ${esc(cat)}</div><div class="menu-grid">`;
    html+=items.map(m=>`<div class="menu-grid-item" onclick="agregarDesdeMenu('${m.id}')">
      ${prodImg(m,'grid')}
      <div class="mgi-name">${esc(m.nombre)}</div>
      <div class="mgi-price">${fmtPrice(m.precio_usd)} c/u</div>
      <span class="pill ${m.tipo}">${m.tipo==='combo'?`${m.unidades_combo} ${esc(m.unidad)}s`:'Suelta'}</span>
    </div>`).join('');
    html+='</div>';
  });
  el.innerHTML=html||'<div class="empty"><i class="ti ti-search"></i>Sin resultados.</div>';
}
async function agregarDesdeMenu(menuId){
  const prod=menuItems.find(m=>m.id===menuId);if(!prod)return;
  let cant=1;
  if(prod.tipo==='suelto'){const inp=prompt(`¿Cuántas ${prod.unidad}s de "${prod.nombre}"?`,'1');if(inp===null)return;cant=parseInt(inp)||1;if(cant<1)return;}
  const item={pedido_id:pedidoActual.id,menu_id:prod.id,nombre:prod.nombre,tipo:prod.tipo,total:prod.tipo==='combo'?prod.unidades_combo:cant,consumido:0,precio_usd:prod.precio_usd,unidad:prod.unidad};
  await enCurso('agregar-'+menuId,null,async()=>{
    const{data,error}=await sb.from('pedido_items').insert(item).select().single();
    if(error){showToast(msgError(error,'No se pudo agregar'),'danger');return;}
    if(!pedidoActual.pedido_items)pedidoActual.pedido_items=[];
    pedidoActual.pedido_items.push(data);
    feedback();switchTab('consumo');
  });
}
function toggleCustom(){alternar('custom-form');}
function toggleTipo(){const v=$('tipo-item').value;mostrar('f-combo',v==='combo');mostrar('f-suelto',v==='suelto');}
async function agregarItemCustom(){
  const tipo=$('tipo-item').value;
  const nombre=$('item-nombre').value.trim();
  const precio_usd=parseFloat($('item-precio').value)||0;
  const unidad=$('item-unidad').value.trim()||'und';
  if(!nombre){alert('Escribe el nombre');return;}
  const total=tipo==='combo'?parseInt($('item-total').value)||1:parseInt($('item-cant').value)||1;
  const{data}=await sb.from('pedido_items').insert({pedido_id:pedidoActual.id,nombre,tipo,total,consumido:0,precio_usd,unidad}).select().single();
  if(!pedidoActual.pedido_items)pedidoActual.pedido_items=[];
  pedidoActual.pedido_items.push(data);
  ['item-nombre','item-total','item-cant','item-precio','item-unidad'].forEach(id=>{const el=$(id);if(el)el.value='';});
  mostrar('custom-form',false);
  feedback();switchTab('consumo');
}

// ---- CONSUMO ----
async function consumir(itemId,delta){
  const item=(pedidoActual.pedido_items||[]).find(i=>i.id===itemId);if(!item)return;
  const n=item.consumido+delta;if(n<0||n>item.total)return;
  item.consumido=n;
  await sb.from('pedido_items').update({consumido:n}).eq('id',itemId);
  feedback();renderConsumo();checkNotificaciones();
}
async function reabastecer(itemId){
  const item=(pedidoActual.pedido_items||[]).find(i=>i.id===itemId);
  if(!item)return;
  const inp=prompt(`¿Cuántas unidades agregar al combo "${item.nombre}"?`,'10');
  if(inp===null)return;
  const agregar=parseInt(inp)||0;
  if(agregar<=0)return;
  const nuevoTotal=item.total+agregar;
  item.total=nuevoTotal;
  await restPatch('pedido_items',itemId,{total:nuevoTotal});
  feedback();
  renderConsumo();
  showToast(`+${agregar} unidades agregadas a ${item.nombre} ✓`);
}
async function quitarItem(itemId){
  await sb.from('pedido_items').delete().eq('id',itemId);
  pedidoActual.pedido_items=(pedidoActual.pedido_items||[]).filter(i=>i.id!==itemId);
  renderConsumo();
}
function renderConsumo(){
  const el=$('consumo-list');
  if(!pedidoActual||(pedidoActual.pedido_items||[]).length===0){el.innerHTML='<div class="empty"><i class="ti ti-glass"></i>Sin ítems todavía.<br>Ve a <strong>Agregar</strong>.</div>';return;}
  el.innerHTML=(pedidoActual.pedido_items||[]).map(item=>{
    const restante=item.total-item.consumido;
    const pct=Math.round((item.consumido/item.total)*100);
    const fc=pct>=100?'full':pct>=70?'warn':'';
    const esCombo=item.tipo==='combo';
    const sub=esCombo?`<strong>${restante}</strong> de ${item.total} ${esc(item.unidad)}s restantes`:`${item.consumido} de ${item.total} pedida${item.total>1?'s':''}`;
    return`<div class="item-row">
      ${prodImg(item,'sm')}
      <div class="ii"><div class="in">${esc(item.nombre)}</div>
        <div class="is">${sub}${item.precio_usd>0?' · '+fmtPrice(item.precio_usd)+' c/u':''}</div>
        ${esCombo?`<div class="prog-bar"><div class="prog-fill ${fc}" style="width:${pct}%"></div></div>`:''}
        ${esCombo&&pct>=100?`<button class="btn sm success mt-s" onclick="reabastecer('${item.id}')"><i class="ti ti-refresh"></i> Reabastecer combo</button>`:''}
      </div>
      <div class="counter">
        <button class="cbtn" onclick="consumir('${item.id}',-1)" aria-label="Restar">−</button>
        <span class="cval">${esCombo?restante:item.consumido}</span>
        <button class="cbtn mas" onclick="consumir('${item.id}',1)" aria-label="Sumar">+</button>
        <button class="btn sm danger ico" onclick="quitarItem('${item.id}')" aria-label="Quitar"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ---- CUENTA ----
function renderCuenta(){
  const el=$('cuenta-list');
  if(!pedidoActual||(pedidoActual.pedido_items||[]).length===0){el.innerHTML=vacio('Sin ítems.');$('cuenta-total').innerHTML='';return;}
  let total=0;
  el.innerHTML=(pedidoActual.pedido_items||[]).map(item=>{const sub=item.consumido*item.precio_usd;total+=sub;return`<div class="res-row"><span>${esc(item.nombre)} <span class="t-sub">× ${item.consumido}</span></span>${fmtDual(sub)}</div>`;}).join('');
  $('cuenta-total').innerHTML=fmtDual(total);
}

// ---- MÉTODO DE PAGO ----
let metodoPago = 'Efectivo';
function selMetodo(m){
  metodoPago=m;
  marcarActivo('mp-',['Efectivo','Zelle','Pago móvil','Transferencia'],m);
}
