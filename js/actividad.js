// ==========================================================
// Actividad: la del empleado y la de todo el equipo (dueño)
// ==========================================================

let actPeriodo='hoy';
let empPeriodo='hoy';

function switchActPeriodo(p){
  actPeriodo=p;
  marcarActivo('act-',['hoy','sem','mes'],p.substring(0,3));
  renderMiActividad();
}

function switchEmpPeriodo(p){
  empPeriodo=p;
  marcarActivo('emp-',['hoy','sem','mes'],p.substring(0,3));
  renderActividadEmpleados();
}

function getDesde(periodo){
  const hoy=new Date();
  if(periodo==='hoy'){hoy.setHours(0,0,0,0);return hoy.toISOString();}
  if(periodo==='semana'){hoy.setDate(hoy.getDate()-7);return hoy.toISOString();}
  if(periodo==='mes'){hoy.setDate(1);hoy.setHours(0,0,0,0);return hoy.toISOString();}
  return hoy.toISOString();
}

async function renderMiActividad(){
  if(!user||!sucursalActual)return;
  const desde=getDesde(actPeriodo);
  const caja=await restGet('caja?select=*&sucursal_id=eq.'+sucursalActual.id+'&usuario_id=eq.'+user.id+'&fecha=gte.'+desde+'&order=fecha.desc');
  const r=resumenCaja(caja);

  $('act-metrics').innerHTML=
    metrica('Mis ventas USD',fmtUSD(r.totalUSD),'success',true)+
    metrica('Mis ventas Bs',fmtBsTotal(r.totalBs),'success sm')+
    metrica('Pedidos atendidos',r.num)+
    metrica('Ticket promedio',fmtUSD(r.ticket),'sm');

  // Horario de actividad
  const horas={};
  caja.forEach(p=>{
    const h=new Date(p.fecha).getHours();
    horas[h]=(horas[h]||0)+1;
  });
  const horaEl=$('act-horario');
  if(!Object.keys(horas).length){
    horaEl.innerHTML=vacio('Sin actividad en este período.');
  } else {
    const maxH=Math.max(...Object.values(horas));
    horaEl.innerHTML=Object.entries(horas).sort((a,b)=>a[0]-b[0]).map(([h,c])=>`
      <div class="barra-hora">
        <span class="h">${h}:00 h</span>
        <div class="pista"><div class="relleno" style="width:${Math.round(c/maxH*100)}%"></div></div>
        <span class="c">${c}</span>
      </div>`).join('');
  }

  // Pedidos recientes
  const pedEl=$('act-pedidos');
  if(!caja.length){pedEl.innerHTML=vacio('Sin pedidos en este período.');}
  else{pedEl.innerHTML=caja.slice(0,10).map(p=>`<div class="res-row">
    <div class="crece"><div class="t-fuerte recorta">${esc(p.cliente_nombre)}</div>
    <div class="t-mini">${new Date(p.fecha).toLocaleString('es-VE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${esc(p.metodo_pago||'Efectivo')}</div></div>
    ${montoBloque(p.total_usd,p.tasa_bcv)}
  </div>`).join('');}

  // Productos más vendidos del empleado
  if(caja.length){
    const items=await itemsDePedidos(caja.map(c=>c.pedido_id).filter(Boolean));
    const sorted=agruparItems(items).sort((a,b)=>b.total-a.total).slice(0,5);
    $('act-productos').innerHTML=sorted.length?sorted.map((r,idx)=>filaRanking(idx,r,false)).join(''):vacio('Sin datos.');
  } else {
    $('act-productos').innerHTML=vacio('Sin datos.');
  }
}

async function renderActividadEmpleados(){
  if(!sucursalActual)return;
  const desde=getDesde(empPeriodo);
  const el=$('emp-list');
  el.innerHTML='<div class="spinner centro"></div>';

  const[perfiles,caja]=await Promise.all([
    restGet('perfiles?select=id,nombre,rol&sucursal_id=eq.'+sucursalActual.id),
    restGet('caja?select=*&sucursal_id=eq.'+sucursalActual.id+'&fecha=gte.'+desde)
  ]);

  if(!perfiles.length){el.innerHTML='<div class="empty"><i class="ti ti-users"></i>Sin empleados registrados.</div>';return;}

  el.innerHTML=perfiles.map(p=>{
    const r=resumenCaja(caja.filter(c=>c.usuario_id===p.id));
    const esDueno=p.rol==='dueno';
    return`<div class="card">
      <div class="fila mb-m">
        <div class="avatar">${ini(p.nombre||'?')}</div>
        <div class="crece">
          <div class="t-fuerte recorta">${esc(p.nombre||'Sin nombre')}</div>
          <div class="fila gap-s" style="margin-top:3px"><span class="pill ${esDueno?'dueno':'empleado'}">${esDueno?'Dueño':'Empleado'}</span><span class="t-mini">${r.num} ${plural(r.num,'pedido')}</span></div>
        </div>
        <div class="monto"><div class="monto-usd">${fmtUSD(r.totalUSD)}</div><div class="monto-bs">${fmtBsTotal(r.totalBs)}</div></div>
      </div>
      <div class="g2 dos" style="margin-bottom:0">
        ${metrica('Pedidos',r.num,'sm')}
        ${metrica('Ticket prom.',fmtUSD(r.ticket),'sm')}
      </div>
    </div>`;
  }).join('');
}
