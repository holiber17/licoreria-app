// ==========================================================
// Administración (solo dueño): sucursales, usuarios,
// reportes, marca del negocio y backup
// ==========================================================

let repPeriodo='semana';
let sucursalesCache=[];

async function loadAdmin(){switchAdminTab('sucursales');}

function switchAdminTab(tab){
  ['sucursales','usuarios','reportes','empleados'].forEach(t=>{
    mostrar('amt-'+t,t===tab);
    $('atab-'+t)?.classList.toggle('active',t===tab);
  });
  if(tab==='sucursales'){renderSucursales();cargarBrandingActual();renderCartaPublica();cargarDatosPago();}
  if(tab==='usuarios')renderUsuarios();
  if(tab==='reportes')renderReportes();
  if(tab==='empleados')renderActividadEmpleados();
}

// ---- REPORTES ----
function switchRepPeriodo(p){
  repPeriodo=p;
  marcarActivo('rep-',['sem','mes'],p.substring(0,3));
  renderReportes();
}

const METODO_ICONOS={'Efectivo':'ti-cash','Zelle':'ti-building-bank','Pago móvil':'ti-device-mobile','Transferencia':'ti-arrows-exchange'};

async function renderReportes(){
  if(!sucursalActual)return;
  const hoy=new Date();
  let desde=new Date(hoy);
  if(repPeriodo==='semana'){desde.setDate(hoy.getDate()-7);}
  else{desde.setDate(1);}
  const desdeStr=desde.toISOString().split('T')[0];

  const[caja,tasas]=await Promise.all([
    restGet('caja?select=*&sucursal_id=eq.'+sucursalActual.id+'&fecha=gte.'+desdeStr+'T00:00:00&order=fecha.asc'),
    restGet('tasas_bcv?select=*&sucursal_id=eq.'+sucursalActual.id+'&fecha=gte.'+desdeStr+'&order=fecha.desc')
  ]);

  // Métricas generales
  const r=resumenCaja(caja);
  $('rep-metrics').innerHTML=
    metrica('Total USD',fmtUSD(r.totalUSD),'success',true)+
    metrica('Total Bs',fmtBsTotal(r.totalBs),'success sm')+
    metrica('Pedidos',r.num)+
    metrica('Ticket prom.',fmtUSD(r.ticket),'sm');

  // Historial de la tasa BCV
  $('rep-tasa-list').innerHTML=tasas.length?tasas.map(t=>`<div class="res-row">
      <span>${new Date(t.fecha+'T12:00:00').toLocaleDateString('es-VE',{weekday:'short',day:'2-digit',month:'2-digit'})}</span>
      <span class="t-fuerte">Bs ${parseFloat(t.tasa).toFixed(2)}/$</span>
    </div>`).join(''):vacio('Sin historial de tasas aún.');

  // Productos más vendidos
  const items=await itemsDePedidos(caja.map(c=>c.pedido_id).filter(Boolean));
  const sorted=agruparItems(items).sort((a,b)=>b.total-a.total).slice(0,10);
  $('rep-productos').innerHTML=sorted.length?sorted.map((r,idx)=>filaRanking(idx,r)).join(''):vacio('Sin ventas en este período.');

  // Por método de pago
  const porMetodo={};
  caja.forEach(p=>{
    const m=p.metodo_pago||'Efectivo';
    if(!porMetodo[m])porMetodo[m]={total:0,pedidos:0};
    porMetodo[m].total+=parseFloat(p.total_usd||0);
    porMetodo[m].pedidos++;
  });
  const metodosList=Object.entries(porMetodo).sort((a,b)=>b[1].total-a[1].total);
  $('rep-metodos').innerHTML=metodosList.length?metodosList.map(([m,d])=>`<div class="res-row">
      <div class="fila crece"><i class="ti ${METODO_ICONOS[m]||'ti-credit-card'} t-acento" style="font-size:18px"></i>
        <span><span class="t-fuerte">${esc(m)}</span> <span class="t-sub">${d.pedidos} ${plural(d.pedidos,'pedido')}</span></span></div>
      ${montoBloque(d.total)}
    </div>`).join(''):vacio('Sin ventas en este período.');

  // Ventas por día
  const porDia={};
  caja.forEach(p=>{
    const dia=p.fecha.split('T')[0];
    if(!porDia[dia])porDia[dia]={total:0,pedidos:0};
    porDia[dia].total+=parseFloat(p.total_usd||0);
    porDia[dia].pedidos++;
  });
  const dias=Object.entries(porDia).sort((a,b)=>b[0].localeCompare(a[0]));
  $('rep-dias').innerHTML=dias.length?dias.map(([dia,d])=>`<div class="res-row">
    <div class="crece">
      <div class="t-fuerte" style="text-transform:capitalize">${new Date(dia+'T12:00:00').toLocaleDateString('es-VE',{weekday:'long',day:'2-digit',month:'2-digit'})}</div>
      <div class="t-mini">${d.pedidos} ${plural(d.pedidos,'pedido')}</div>
    </div>
    ${montoBloque(d.total)}
  </div>`).join(''):vacio('Sin ventas en este período.');
}

// ---- SUCURSALES ----
function toggleSucForm(){alternar('suc-form');}
async function guardarSucursal(){
  const nombre=$('suc-nombre').value.trim();
  const ciudad=$('suc-ciudad').value.trim();
  const direccion=$('suc-dir').value.trim();
  if(!nombre){alert('Escribe el nombre');return;}
  await sb.from('sucursales').insert({nombre,ciudad,direccion,activa:true});
  ['suc-nombre','suc-ciudad','suc-dir'].forEach(id=>$(id).value='');
  mostrar('suc-form',false);
  showToast('Sucursal creada ✓');renderSucursales();
}
async function renderSucursales(){
  const sucs=await restGet('sucursales?select=id,nombre,ciudad,direccion,activa,logo_url,app_nombre&order=created_at');
  sucursalesCache=sucs;
  const el=$('sucursales-list');
  if(!sucs.length){el.innerHTML='<div class="empty"><i class="ti ti-building-store"></i>Sin sucursales.</div>';return;}
  el.innerHTML=sucs.map(s=>{
    const activa=s.id===sucursalActual?.id;
    return`<div class="suc-card ${activa?'active-branch':''}">
      <div class="fila crece"><i class="ti ti-building-store t-acento" style="font-size:22px"></i>
        <div class="crece"><div class="t-fuerte recorta">${esc(s.nombre)}</div>
        <div class="t-sub recorta">${esc(s.ciudad||'')} ${s.direccion?'· '+esc(s.direccion):''}</div></div>
      </div>
      ${activa?'<span class="pill cobrado">Activa</span>':`<button class="btn sm" onclick="cambiarSucursal('${s.id}')">Ir <i class="ti ti-arrow-right"></i></button>`}
    </div>`;
  }).join('');
}
async function cambiarSucursal(id){
  const s=sucursalesCache.find(x=>x.id===id);
  const nombre=s?.nombre||'';
  await sb.from('perfiles').update({sucursal_id:id}).eq('id',user.id);
  sucursalActual=s?{...s}:{id,nombre};
  $('sucursal-badge').textContent=nombre;
  showToast('Sucursal: '+nombre);
  await loadMenu();renderPedidos();renderSucursales();
}

// ---- USUARIOS ----
async function renderUsuarios(){
  const[users,sucs]=await Promise.all([
    restGet('perfiles?select=*,sucursales(nombre)&order=created_at'),
    restGet('sucursales?select=id,nombre&order=nombre')
  ]);
  const el=$('usuarios-list');
  if(!users.length){el.innerHTML='<div class="empty"><i class="ti ti-users"></i>Sin usuarios registrados.</div>';return;}
  const pending=users.filter(u=>!u.sucursal_id);
  const active=users.filter(u=>u.sucursal_id);
  if(pending.length){
    mostrar('pending-banner',true,'flex');
    $('pending-count').textContent=`${pending.length} ${plural(pending.length,'usuario')} ${plural(pending.length,'pendiente')} de activación`;
  } else mostrar('pending-banner',false);
  const sucOptions=sucs.map(s=>`<option value="${s.id}">${esc(s.nombre)}</option>`).join('');
  const renderUser=(u,isPending)=>`
    <div class="user-card ${isPending?'pending':''}">
      <div class="fila">
        <div class="avatar">${ini(u.nombre||u.id)}</div>
        <div class="crece">
          <div class="t-fuerte recorta">${esc(u.nombre||'Sin nombre')}</div>
          <div class="t-sub">${u.sucursales?.nombre?esc(u.sucursales.nombre):'<span class="t-aviso">Sin sucursal asignada</span>'}</div>
        </div>
        <span class="pill ${u.rol||'empleado'}">${u.rol==='dueno'?'Dueño':u.rol==='empleado'?'Empleado':'Pendiente'}</span>
      </div>
      ${isPending?`<div class="fila gap-s envuelve mt-m">
        <select id="suc-sel-${u.id}" class="campo sm crece">
          <option value="">Seleccionar sucursal...</option>${sucOptions}
        </select>
        <button class="btn sm success" onclick="activarUsuario('${u.id}')"><i class="ti ti-check"></i> Activar</button>
      </div>`:`<div class="fila gap-s envuelve mt-m">
        <select class="campo sm" style="width:auto" onchange="cambiarRol('${u.id}',this.value)">
          <option value="dueno" ${u.rol==='dueno'?'selected':''}>Dueño</option>
          <option value="empleado" ${u.rol==='empleado'?'selected':''}>Empleado</option>
        </select>
        <select class="campo sm crece" onchange="cambiarSucursalUsuario('${u.id}',this.value)">
          ${sucs.map(s=>`<option value="${s.id}" ${u.sucursal_id===s.id?'selected':''}>${esc(s.nombre)}</option>`).join('')}
        </select>
      </div>`}
    </div>`;
  el.innerHTML=[...pending.map(u=>renderUser(u,true)),...active.map(u=>renderUser(u,false))].join('');
}
async function activarUsuario(userId){
  const sucId=$('suc-sel-'+userId)?.value;
  if(!sucId){showToast('Selecciona una sucursal','danger');return;}
  await restPatch('perfiles',userId,{sucursal_id:sucId,rol:'empleado'});
  showToast('Usuario activado ✓');renderUsuarios();
}
async function cambiarRol(userId,rol){await restPatch('perfiles',userId,{rol});showToast('Rol actualizado ✓');}
async function cambiarSucursalUsuario(userId,sucId){await restPatch('perfiles',userId,{sucursal_id:sucId});showToast('Sucursal actualizada ✓');}

// ---- BACKUP ----
function estadoBackup(html,tipo){
  const s=$('backup-status');
  s.style.display='flex';
  s.className='banner mt-m '+tipo;
  s.innerHTML=html;
}

async function exportarBackup(){
  if(!sucursalActual)return;
  estadoBackup('<i class="ti ti-refresh"></i> Generando backup...','aviso');
  try{
    const hace90=new Date();hace90.setDate(hace90.getDate()-90);
    const[menu,sucursales,caja,tasas]=await Promise.all([
      restGet('menu?select=*&sucursal_id=eq.'+sucursalActual.id+'&order=categoria'),
      restGet('sucursales?select=*'),
      restGet('caja?select=*&sucursal_id=eq.'+sucursalActual.id+'&fecha=gte.'+hace90.toISOString()+'&order=fecha.desc'),
      restGet('tasas_bcv?select=*&sucursal_id=eq.'+sucursalActual.id+'&order=fecha.desc')
    ]);

    const backup={
      version:'1.0',
      fecha:new Date().toISOString(),
      negocio:sucursalActual.app_nombre||sucursalActual.nombre,
      sucursal:sucursalActual,
      sucursales,
      menu,
      caja_90dias:caja,
      tasas_bcv:tasas,
      resumen:{
        total_productos:menu.length,
        total_ventas_90dias:caja.reduce((s,p)=>s+parseFloat(p.total_usd||0),0).toFixed(2),
        total_pedidos_90dias:caja.length
      }
    };

    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const fecha=new Date().toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'-');
    a.href=url;
    a.download=`backup_${(sucursalActual.app_nombre||sucursalActual.nombre).replace(/\s+/g,'_')}_${fecha}.json`;
    a.click();
    URL.revokeObjectURL(url);

    estadoBackup(`<i class="ti ti-check"></i> Backup generado: ${menu.length} productos, ${caja.length} ventas (últimos 90 días)`,'ok');
  }catch(e){
    estadoBackup('<i class="ti ti-alert-triangle"></i> Error al generar backup','error');
  }
}

async function importarBackup(event){
  const file=event.target.files[0];
  if(!file)return;
  estadoBackup('<i class="ti ti-refresh"></i> Leyendo archivo...','aviso');

  try{
    const backup=JSON.parse(await file.text());

    if(!backup.version||!backup.menu){
      estadoBackup('<i class="ti ti-alert-triangle"></i> Archivo inválido: no es un backup de LicorApp','error');
      return;
    }

    const conf=confirm(`¿Importar backup de "${backup.negocio}" del ${new Date(backup.fecha).toLocaleDateString('es-VE')}?\n\nEsto restaurará ${backup.menu.length} productos del menú.\n\nLos productos actuales NO se borrarán, solo se agregarán los nuevos.`);
    if(!conf)return;

    let importados=0;
    // Importar solo productos que no existan
    const menuActual=await restGet('menu?select=nombre&sucursal_id=eq.'+sucursalActual.id);
    const nombresActuales=new Set(menuActual.map(m=>m.nombre.toLowerCase()));

    for(const prod of backup.menu){
      if(!nombresActuales.has(prod.nombre.toLowerCase())){
        await restInsert('menu',{
          sucursal_id:sucursalActual.id,
          nombre:prod.nombre,tipo:prod.tipo,
          precio_usd:prod.precio_usd,
          unidades_combo:prod.unidades_combo,
          unidad:prod.unidad,categoria:prod.categoria,
          imagen_url:prod.imagen_url||null,
          activo:true
        });
        importados++;
      }
    }

    await loadMenu();
    estadoBackup(`<i class="ti ti-check"></i> Importación completada: ${importados} productos nuevos agregados`,'ok');
    event.target.value='';
  }catch(e){
    estadoBackup('<i class="ti ti-alert-triangle"></i> Error al importar: archivo corrupto o inválido','error');
  }
}

// ---- MARCA DEL NEGOCIO ----
let brandLogoBase64 = null;

function previewBrand(){
  const nombre=$('brand-nombre').value.trim();
  if(nombre){
    $('brand-preview-nombre').textContent=nombre;
    mostrar('brand-preview');
  }
}

function previewLogoUrl(){
  const url=$('brand-url').value.trim();
  if(url){
    $('brand-preview-img').src=url;
    mostrar('brand-preview');
    brandLogoBase64=null;
  }
}

function previewLogoFile(){
  const file=$('brand-file').files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    brandLogoBase64=e.target.result;
    $('brand-preview-img').src=brandLogoBase64;
    mostrar('brand-preview');
    $('brand-url').value='';
  };
  reader.readAsDataURL(file);
}

async function guardarBranding(){
  if(!sucursalActual)return;
  const nombre=$('brand-nombre').value.trim();
  const logoUrl=brandLogoBase64||$('brand-url').value.trim()||null;
  if(!nombre&&!logoUrl){showToast('Ingresa un nombre o logo','danger');return;}
  const update={};
  if(nombre)update.app_nombre=nombre;
  if(logoUrl)update.logo_url=logoUrl;
  const res=await restPatch('sucursales',sucursalActual.id,update);
  if(res.ok){
    sucursalActual={...sucursalActual,...update};
    aplicarMarca(nombre,logoUrl);
    showToast('¡Guardado! La app ahora se llama '+(nombre||sucursalActual.app_nombre||'LicorApp')+' ✓');
    brandLogoBase64=null;
    $('brand-nombre').value='';
    $('brand-url').value='';
    $('brand-file').value='';
    mostrar('brand-preview',false);
  } else {
    showToast('Error al guardar','danger');
  }
}

// Cargar valores actuales al abrir Admin
function cargarBrandingActual(){
  if(sucursalActual?.app_nombre)$('brand-nombre').value=sucursalActual.app_nombre;
  if(sucursalActual?.logo_url){
    $('brand-url').value=sucursalActual.logo_url;
    $('brand-preview-img').src=sucursalActual.logo_url;
    mostrar('brand-preview');
  }
  if(sucursalActual?.app_nombre){
    $('brand-preview-nombre').textContent=sucursalActual.app_nombre;
    mostrar('brand-preview');
  }
}

// ---- CARTA PÚBLICA ----
function urlCarta(){return new URL('carta.html?s='+sucursalActual.id,location.href).href;}
function renderCartaPublica(){
  if(!sucursalActual||!$('carta-url'))return;
  const url=urlCarta();
  $('carta-url').textContent=url;
  $('carta-qr').innerHTML='<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+encodeURIComponent(url)+'" alt="QR de la carta">';
}
async function copiarCarta(){
  try{await navigator.clipboard.writeText(urlCarta());showToast('Enlace copiado ✓');}
  catch(e){prompt('Copia el enlace de la carta:',urlCarta());}
}
function abrirCarta(){window.open(urlCarta(),'_blank');}
function compartirCarta(){
  const texto=`🍾 *${nombreNegocio()}*\nMira nuestra carta y los precios del día:\n${urlCarta()}`;
  window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(texto),'_blank');
}

// ---- DATOS DE PAGO (los ve el cliente en la página del QR) ----
const CAMPOS_PAGO={
  pago_movil:{banco:'dp-pm-banco',telefono:'dp-pm-tel',cedula:'dp-pm-ced'},
  transferencia:{banco:'dp-tr-banco',cuenta:'dp-tr-cuenta',titular:'dp-tr-titular',cedula:'dp-tr-ced'},
  zelle:{correo:'dp-ze-correo',titular:'dp-ze-titular'}
};
function avisoPagoSinSql(){
  estadoDatosPago('<i class="ti ti-database"></i> Falta un paso: ejecuta <strong>supabase/cliente.sql</strong> en Supabase para guardar los datos de pago.','aviso');
}
function estadoDatosPago(html,tipo){
  const s=$('datos-pago-status');
  if(!html){s.style.display='none';return;}
  s.style.display='flex';s.className='banner mt-m '+tipo;s.innerHTML=html;
}
async function cargarDatosPago(){
  if(!sucursalActual||!$('dp-pm-banco'))return;
  estadoDatosPago('');
  const r=await rest('sucursales?select=datos_pago&id=eq.'+sucursalActual.id);
  if(r.status===400){avisoPagoSinSql();return;}
  const d=r.ok?(await r.json())[0]?.datos_pago||{}:{};
  Object.entries(CAMPOS_PAGO).forEach(([m,campos])=>{
    Object.entries(campos).forEach(([k,id])=>{$(id).value=(d[m]||{})[k]||'';});
  });
}
async function guardarDatosPago(){
  if(!sucursalActual)return;
  const datos={};
  Object.entries(CAMPOS_PAGO).forEach(([m,campos])=>{
    datos[m]={};
    Object.entries(campos).forEach(([k,id])=>{const v=$(id).value.trim();if(v)datos[m][k]=v;});
  });
  const r=await restPatch('sucursales',sucursalActual.id,{datos_pago:datos});
  if(r.status===400){avisoPagoSinSql();return;}
  if(!r.ok){showToast('Error al guardar','danger');return;}
  estadoDatosPago('');
  showToast('Datos de pago guardados ✓');
}
