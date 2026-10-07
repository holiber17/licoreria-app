// ==========================================================
// Menú: productos que se venden (combos y bebidas sueltas)
// ==========================================================

async function loadMenu(){
  if(!sucursalActual)return;
  menuItems=await restGet('menu?select=*&sucursal_id=eq.'+sucursalActual.id+'&activo=eq.true&order=categoria');
}

function toggleMenuForm(){alternar('menu-form');}
function toggleMfTipo(){mostrar('mf-combo-f',$('mf-tipo').value==='combo');}

async function guardarMenuProduct(){
  const tipo=$('mf-tipo').value;
  const nombre=$('mf-nombre').value.trim();
  const precio_usd=parseFloat($('mf-precio').value)||0;
  const unidad=$('mf-unidad').value.trim()||'und';
  const categoria=$('mf-cat').value.trim()||'General';
  if(!nombre){alert('Escribe el nombre');return;}
  const unidades_combo=tipo==='combo'?parseInt($('mf-total').value)||1:1;
  await sb.from('menu').insert({sucursal_id:sucursalActual.id,nombre,tipo,precio_usd,unidad,categoria,unidades_combo,activo:true});
  ['mf-nombre','mf-total','mf-precio','mf-unidad','mf-cat'].forEach(id=>{const el=$(id);if(el)el.value='';});
  mostrar('menu-form',false);
  await loadMenu();renderMenu();showToast('Producto agregado ✓');
}

// ---- EDITAR ----
let editandoId=null;

function abrirEditModal(id){
  const prod=menuItems.find(m=>m.id===id);
  if(!prod)return;
  editandoId=id;
  $('ef-tipo').value=prod.tipo;
  $('ef-nombre').value=prod.nombre;
  $('ef-total').value=prod.unidades_combo||1;
  $('ef-precio').value=prod.precio_usd;
  $('ef-unidad').value=prod.unidad;
  $('ef-cat').value=prod.categoria||'';
  $('ef-imagen').value=prod.imagen_url||'';
  toggleEfTipo();
  previewEdicion(prod.imagen_url);
  abrirModal('edit-modal');
}
function cerrarEditModal(){cerrarModal('edit-modal');editandoId=null;}
function toggleEfTipo(){mostrar('ef-combo-f',$('ef-tipo').value==='combo');}
function previewEdicion(url){
  mostrar('ef-preview',!!url);
  if(url)$('ef-preview-img').src=url;
}
$('ef-imagen')?.addEventListener('input',function(){previewEdicion(this.value.trim());});

async function guardarEdicion(){
  if(!editandoId)return;
  const tipo=$('ef-tipo').value;
  const nombre=$('ef-nombre').value.trim();
  const precio_usd=parseFloat($('ef-precio').value)||0;
  const unidad=$('ef-unidad').value.trim()||'und';
  const categoria=$('ef-cat').value.trim()||'General';
  const imagen_url=$('ef-imagen').value.trim()||null;
  const unidades_combo=tipo==='combo'?parseInt($('ef-total').value)||1:1;
  if(!nombre){alert('Escribe el nombre');return;}
  await restPatch('menu',editandoId,{nombre,tipo,precio_usd,unidad,categoria,unidades_combo,imagen_url});
  cerrarEditModal();
  await loadMenu();renderMenu();
  showToast('Producto actualizado ✓');
}

async function eliminarMenuProduct(id){
  if(!confirm('¿Eliminar este producto?'))return;
  await restPatch('menu',id,{activo:false});
  await loadMenu();renderMenu();
}

// ---- LISTA ----
function renderMenu(){
  const el=$('menu-list');
  if(!el)return;
  if(!menuItems.length){el.innerHTML='<div class="empty"><i class="ti ti-bottle"></i>Menú vacío.<br>Agrega tu primer producto.</div>';return;}
  const q=($('menu-filter')?.value||'').toLowerCase();
  const filtrado=menuItems.filter(m=>m.nombre.toLowerCase().includes(q)||m.categoria?.toLowerCase().includes(q));
  const cats=[...new Set(filtrado.map(m=>m.categoria||'General'))];
  el.innerHTML=cats.map(cat=>{
    const items=filtrado.filter(m=>(m.categoria||'General')===cat);
    return`<div class="card"><div class="ch">${getCatIcon(cat)} ${esc(cat)} <span class="t-mini">· ${items.length}</span></div>${items.map(m=>`<div class="mi">
      ${prodImg(m,'sm')}
      <div class="crece">
        <div class="menu-prod-nombre">${esc(m.nombre)} <span class="pill ${m.tipo}">${m.tipo==='combo'?'Combo':'Suelta'}</span></div>
        <div class="t-sub" style="margin-top:3px">${m.tipo==='combo'?m.unidades_combo+' '+esc(m.unidad)+'s · ':''}${fmtPrice(m.precio_usd)} por ${esc(m.unidad)}</div>
      </div>
      <div class="fila gap-s">
        <button class="btn sm ico" onclick="abrirEditModal('${m.id}')" aria-label="Editar"><i class="ti ti-pencil"></i></button>
        <button class="btn sm danger ico" onclick="eliminarMenuProduct('${m.id}')" aria-label="Eliminar"><i class="ti ti-trash"></i></button>
      </div>
    </div>`).join('')}</div>`;
  }).join('')||'<div class="empty"><i class="ti ti-search"></i>Sin resultados.</div>';
}
