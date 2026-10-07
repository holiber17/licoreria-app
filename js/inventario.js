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

// ---- AUTO DESCUENTO AL COBRAR ----
async function descontarInventario(itemsVendidos){
  if(!invItems.length)return;
  for(const item of itemsVendidos){
    const inv=invItems.find(i=>i.nombre.toLowerCase()===item.nombre.toLowerCase());
    if(!inv||inv.stock_actual<=0)continue;
    const cantidad=item.consumido;
    const nuevoStock=Math.max(0,inv.stock_actual-cantidad);
    await restPatch('inventario',inv.id,{stock_actual:nuevoStock,updated_at:new Date().toISOString()});
    await restInsert('inventario_movimientos',{inventario_id:inv.id,sucursal_id:sucursalActual.id,usuario_id:user.id,tipo:'salida',cantidad,motivo:'Venta automática'});
    inv.stock_actual=nuevoStock;
  }
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
function toggleInvForm(){if(alternar('inv-form'))$('if-nombre').focus();}
function togglePorCaja(){mostrar('if-caja-fields',$('if-porcaja').checked);}

async function guardarInventario(){
  const nombre=$('if-nombre').value.trim();
  const codigo=$('if-codigo').value.trim()||null;
  const stock=parseFloat($('if-stock').value)||0;
  const min=parseFloat($('if-min').value)||5;
  const unidad=$('if-unidad').value;
  const porCaja=$('if-porcaja').checked;
  const upc=parseInt($('if-upc').value)||1;
  if(!nombre){alert('Escribe el nombre');return;}
  await restInsert('inventario',{sucursal_id:sucursalActual.id,nombre,codigo_barra:codigo,stock_actual:stock,stock_minimo:min,unidad,por_caja:porCaja,unidades_por_caja:upc});
  // Registrar movimiento inicial si hay stock
  if(stock>0){
    const data=await restGet('inventario?select=id&sucursal_id=eq.'+sucursalActual.id+'&nombre=eq.'+encodeURIComponent(nombre)+'&order=created_at.desc&limit=1');
    if(data[0]){
      await restInsert('inventario_movimientos',{inventario_id:data[0].id,sucursal_id:sucursalActual.id,usuario_id:user.id,tipo:'entrada',cantidad:stock,motivo:'Stock inicial'});
    }
  }
  ['if-nombre','if-codigo','if-stock','if-min','if-upc'].forEach(id=>{const el=$(id);if(el)el.value='';});
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

async function guardarMovimiento(){
  if(!movItemId)return;
  const cantidad=parseFloat($('mov-cantidad').value)||0;
  const motivo=$('mov-motivo').value.trim();
  if(cantidad<=0){alert('Ingresa una cantidad válida');return;}
  // Leer el stock actual del servidor
  const invData=await restGet('inventario?select=stock_actual&id=eq.'+movItemId);
  const stockActual=parseFloat(invData[0]?.stock_actual||0);
  let nuevoStock=stockActual;
  if(movTipo==='entrada')nuevoStock=stockActual+cantidad;
  else if(movTipo==='salida')nuevoStock=Math.max(0,stockActual-cantidad);
  else nuevoStock=cantidad; // ajuste directo
  await restPatch('inventario',movItemId,{stock_actual:nuevoStock,updated_at:new Date().toISOString()});
  await restInsert('inventario_movimientos',{inventario_id:movItemId,sucursal_id:sucursalActual.id,usuario_id:user.id,tipo:movTipo,cantidad,motivo:motivo||null});
  cerrarMovModal();
  showToast('Movimiento registrado ✓');
  await loadInventario();
  feedback();
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
