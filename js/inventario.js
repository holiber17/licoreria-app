// ==========================================================
// Inventario: stock, movimientos y escáner de códigos
// ==========================================================

let invItems=[];
let movItemId=null;
let movTipo='entrada';
let scannerStream=null;
let scannerInterval=null;
let scannerCallback=null;

async function loadInventario(){
  if(!sucursalActual)return;
  invItems=await restGet('inventario?select=*&sucursal_id=eq.'+sucursalActual.id+'&order=nombre');
  renderInventario();
  renderInvAlertas();
}

// Estado del stock de un producto: sin stock, última unidad, bajo u ok
function estadoStock(i){
  const pct=i.stock_minimo>0?Math.min(i.stock_actual/i.stock_minimo*100,100):100;
  if(i.stock_actual<=0)return{pct,clase:'error',barra:'full',msg:'Sin stock',icono:'ti-ban'};
  if(i.stock_actual<=1)return{pct,clase:'aviso',barra:'warn',msg:'Última unidad',icono:'ti-alert-triangle'};
  if(pct<=20)return{pct,clase:'aviso',barra:'warn',msg:'Stock bajo',icono:'ti-trending-down'};
  return{pct,clase:'ok',barra:'',msg:'',icono:''};
}

// El descuento por ventas ocurre dentro de la función cobrar_pedido
// (supabase/cobro.sql); aquí ya no se toca el stock al cobrar.

// Opciones del menú para enlazar un producto del inventario
function opcionesMenu(seleccionado){
  return '<option value="">Sin enlazar</option>'+
    menuItems.map(m=>`<option value="${m.id}" ${m.id===seleccionado?'selected':''}>${esc(m.nombre)}</option>`).join('');
}
async function enlazarMenu(invId,menuId){
  const r=await restPatch('inventario',invId,{menu_id:menuId||null});
  if(!r.ok){showToast('No se pudo enlazar','danger');return;}
  const inv=invItems.find(i=>i.id===invId);if(inv)inv.menu_id=menuId||null;
  showToast(menuId?'Enlazado: se descontará al vender ✓':'Enlace quitado');
}

// ---- LISTA ----
function renderInvAlertas(){
  const alertas=invItems.filter(i=>{
    const pct=i.stock_minimo>0?i.stock_actual/i.stock_minimo:1;
    return i.stock_actual<=1||pct<=0.2||i.stock_actual<=0;
  });
  if(!alertas.length){mostrar('inv-alertas',false);return;}
  mostrar('inv-alertas');
  $('inv-alertas-list').innerHTML=alertas.map(i=>{
    const e=estadoStock(i);
    const msg=e.msg||'Stock bajo';
    return`<div class="res-row"><span class="fila gap-s"><i class="ti ${e.icono||'ti-trending-down'} t-${e.clase==='ok'?'aviso':e.clase}"></i>${esc(i.nombre)}</span>
      <span class="t-fuerte t-aviso">${i.stock_actual} ${esc(i.unidad)}${i.stock_actual!==1?'s':''} — ${msg}</span>
    </div>`;
  }).join('');
}

function renderInventario(){
  const el=$('inv-list');
  const q=($('inv-search')?.value||'').toLowerCase();
  const lista=invItems.filter(i=>i.nombre.toLowerCase().includes(q)||(i.codigo_barra||'').includes(q));
  if(!lista.length){
    el.innerHTML='<div class="empty"><i class="ti ti-packages"></i>Sin productos en inventario.<br>Agrega uno o escanea un código.</div>';
    return;
  }
  el.innerHTML=lista.map(i=>{
    const e=estadoStock(i);
    return`<div class="card">
      <div class="fila">
        <div class="crece">
          <div class="t-fuerte">${esc(i.nombre)}</div>
          <div class="t-sub">${i.codigo_barra?'<i class="ti ti-barcode"></i> '+esc(i.codigo_barra)+' · ':''}${i.por_caja?'Caja de '+i.unidades_por_caja+' · ':''}Mín: ${i.stock_minimo} ${esc(i.unidad)}s</div>
        </div>
        <div class="der">
          <div class="stock-num ${e.clase}">${i.stock_actual}</div>
          <div class="t-mini">${esc(i.unidad)}${i.stock_actual!==1?'s':''}</div>
        </div>
      </div>
      <div class="prog-bar mb-m"><div class="prog-fill ${e.barra}" style="width:${e.pct}%"></div></div>
      <label class="enlace-menu"><i class="ti ti-link"></i><span>Se descuenta al vender</span>
        <select class="campo sm" onchange="enlazarMenu('${i.id}',this.value)">${opcionesMenu(i.menu_id)}</select>
      </label>
      <div class="fila gap-s">
        <button class="btn sm success crece" onclick="abrirMovModal('${i.id}','entrada')"><i class="ti ti-plus"></i> Entrada</button>
        <button class="btn sm danger crece" onclick="abrirMovModal('${i.id}','salida')"><i class="ti ti-minus"></i> Salida</button>
        <button class="btn sm ico" onclick="abrirMovModal('${i.id}','ajuste')" aria-label="Ajustar"><i class="ti ti-adjustments"></i></button>
        <button class="btn sm danger ico" onclick="eliminarInv('${i.id}')" aria-label="Eliminar"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

// ---- ALTA ----
function toggleInvForm(){if(alternar('inv-form')){$('if-menu').innerHTML=opcionesMenu('');$('if-nombre').focus();}}
function togglePorCaja(){mostrar('if-caja-fields',$('if-porcaja').checked);}

async function guardarInventario(boton){
  const nombre=$('if-nombre').value.trim();
  const menuId=$('if-menu').value||null;
  const codigo=$('if-codigo').value.trim()||null;
  const stock=parseFloat($('if-stock').value)||0;
  const min=parseFloat($('if-min').value)||5;
  const unidad=$('if-unidad').value;
  const porCaja=$('if-porcaja').checked;
  const upc=parseInt($('if-upc').value)||1;
  if(!nombre){alert('Escribe el nombre');return;}
  const ok=await enCurso('guardar-inv',boton,async()=>{
    // Se crea en 0 y el stock inicial entra como movimiento, así queda en el historial
    const r=await restInsert('inventario',{sucursal_id:sucursalActual.id,menu_id:menuId,nombre,codigo_barra:codigo,stock_actual:0,stock_minimo:min,unidad,por_caja:porCaja,unidades_por_caja:upc},'return=representation');
    if(!r.ok){showToast('No se pudo guardar el producto','danger');return false;}
    const nuevo=(await r.json())[0];
    if(stock>0&&nuevo){
      const{error}=await sb.rpc('mover_stock',{p_inventario:nuevo.id,p_tipo:'entrada',p_cantidad:stock,p_motivo:'Stock inicial'});
      if(error)showToast('Producto creado, pero no se registró el stock inicial','danger');
    }
    return true;
  });
  if(!ok)return;
  ['if-nombre','if-codigo','if-stock','if-min','if-upc','if-menu'].forEach(id=>{const el=$(id);if(el)el.value='';});
  $('if-porcaja').checked=false;
  mostrar('if-caja-fields',false);
  mostrar('inv-form',false);
  showToast('Producto agregado al inventario ✓');
  await loadInventario();
}

async function eliminarInv(id){
  if(!confirm('¿Eliminar este producto del inventario?'))return;
  await restDelete('inventario',id);
  await loadInventario();
}

// ---- MOVIMIENTOS ----
const MOV_TITULOS={entrada:'Entrada',salida:'Salida',ajuste:'Ajuste'};

function abrirMovModal(id,tipo){
  const inv=invItems.find(i=>i.id===id);
  movItemId=id;
  $('mov-titulo').textContent=(MOV_TITULOS[tipo]||'Movimiento')+' — '+(inv?.nombre||'');
  selMovTipo(tipo);
  $('mov-cantidad').value='';
  $('mov-motivo').value='';
  abrirModal('mov-modal');
  setTimeout(()=>$('mov-cantidad').focus(),150);
}
function cerrarMovModal(){cerrarModal('mov-modal');movItemId=null;}
function selMovTipo(t){
  movTipo=t;
  marcarActivo('mov-',['entrada','salida','ajuste'],t);
}

// La suma/resta ocurre dentro de Supabase (función mover_stock), así dos
// teléfonos no se pisan el stock.
async function guardarMovimiento(boton){
  if(!movItemId)return;
  const valor=$('mov-cantidad').value.trim();
  const cantidad=parseFloat(valor);
  const motivo=$('mov-motivo').value.trim();
  const valida=valor!==''&&!isNaN(cantidad)&&(cantidad>0||(movTipo==='ajuste'&&cantidad===0));
  if(!valida){alert(movTipo==='ajuste'?'Ingresa el stock real (puede ser 0)':'Ingresa una cantidad mayor que 0');return;}
  await enCurso('mover-stock',boton,async()=>{
    const{data,error}=await sb.rpc('mover_stock',{p_inventario:movItemId,p_tipo:movTipo,p_cantidad:cantidad,p_motivo:motivo});
    if(error){showToast(msgError(error,'No se pudo registrar'),'danger');return;}
    cerrarMovModal();
    showToast(`Movimiento registrado · stock: ${data} ✓`);
    await loadInventario();
    feedback();
  });
}

// ---- ESCÁNER DE CÓDIGO DE BARRAS ----
async function abrirEscaner(callback){
  scannerCallback=typeof callback==='function'?callback:null;
  abrirModal('scanner-modal');
  const estado=$('scanner-status');
  estado.textContent='Iniciando cámara...';
  try{
    scannerStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const video=$('scanner-video');
    video.srcObject=scannerStream;
    await video.play();
    estado.textContent='Apunta la cámara al código de barra';
    // Usar BarcodeDetector si está disponible
    if('BarcodeDetector' in window){
      const detector=new BarcodeDetector({formats:['ean_13','ean_8','code_128','code_39','upc_a','upc_e']});
      scannerInterval=setInterval(async()=>{
        try{
          const barcodes=await detector.detect(video);
          if(barcodes.length>0){
            await procesarCodigo(barcodes[0].rawValue);
          }
        }catch(e){}
      },500);
    } else {
      estado.innerHTML='Tu navegador no soporta escáner automático.<br>Ingresa el código manualmente:';
      const inp=document.createElement('input');
      inp.placeholder='Código de barra...';
      inp.inputMode='numeric';
      inp.onkeydown=async(e)=>{if(e.key==='Enter'&&inp.value.trim())await procesarCodigo(inp.value.trim());};
      estado.appendChild(inp);
      inp.focus();
    }
  }catch(e){
    estado.textContent='No se pudo acceder a la cámara. Permite el acceso e intenta de nuevo.';
  }
}

async function escanearParaForm(){
  await abrirEscaner((codigo)=>{
    $('if-codigo').value=codigo;
  });
}

async function procesarCodigo(codigo){
  const callback=scannerCallback;
  cerrarEscaner();
  if(callback){
    callback(codigo);
    return;
  }
  // Buscar en inventario
  const existe=invItems.find(i=>i.codigo_barra===codigo);
  if(existe){
    showToast('Producto encontrado: '+existe.nombre);
    abrirMovModal(existe.id,'entrada');
  } else {
    if(confirm(`Código: ${codigo}\n\nNo encontrado en inventario. ¿Agregar como nuevo producto?`)){
      mostrar('inv-form');
      $('if-codigo').value=codigo;
      $('if-nombre').focus();
    }
  }
}

function cerrarEscaner(){
  if(scannerInterval){clearInterval(scannerInterval);scannerInterval=null;}
  if(scannerStream){scannerStream.getTracks().forEach(t=>t.stop());scannerStream=null;}
  cerrarModal('scanner-modal');
  scannerCallback=null;
}
