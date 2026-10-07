// ==========================================================
// Caja del día
// ==========================================================

function switchCajaTab(tab){
  ['historial','productos'].forEach(t=>{mostrar('cmt-'+t,t===tab);$('ctab-'+t).classList.toggle('active',t===tab);});
}

// Totales de una lista de registros de caja
function resumenCaja(registros){
  const totalUSD=registros.reduce((s,p)=>s+parseFloat(p.total_usd||0),0);
  const num=registros.length;
  const totalBs=registros.reduce((s,p)=>s+(parseFloat(p.total_usd||0)*parseFloat(p.tasa_bcv||tasa())),0);
  return{totalUSD,num,ticket:num>0?totalUSD/num:0,totalBs};
}
function fmtBsTotal(n){return'Bs '+Math.round(n).toLocaleString('es-VE');}

async function renderCaja(){
  if(!sucursalActual||!$('caja-metrics'))return;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const{data:caja}=await sb.from('caja').select('*').eq('sucursal_id',sucursalActual.id).gte('fecha',hoy.toISOString()).order('fecha',{ascending:false});
  const registros=caja||[];
  const r=resumenCaja(registros);
  $('caja-metrics').innerHTML=
    metrica('Total USD',fmtUSD(r.totalUSD),'success',true)+
    metrica('Total Bs',fmtBsTotal(r.totalBs),'success sm')+
    metrica('Pedidos cobrados',r.num)+
    metrica('Ticket promedio',fmtUSD(r.ticket),'sm');

  const hel=$('caja-historial');
  if(!registros.length){hel.innerHTML='<div class="empty"><i class="ti ti-receipt"></i>Sin pedidos cobrados hoy.</div>';}
  else hel.innerHTML=registros.map(p=>{
    const t=parseFloat(p.tasa_bcv||tasa());
    return`<div class="hcard">
      <div class="fila arriba entre">
        <div class="crece"><div class="t-fuerte">${esc(p.cliente_nombre)}</div>
        <div class="t-sub">${new Date(p.fecha).toLocaleString('es-VE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · BCV ${t.toFixed(2)} · ${esc(p.metodo_pago||'Efectivo')}${p.nota?' · '+esc(p.nota):''}</div></div>
        ${montoBloque(p.total_usd,t)}
      </div>
    </div>`;
  }).join('');

  // Por producto
  const pel=$('caja-productos');
  if(!registros.length){pel.innerHTML=vacio('Sin ventas registradas.');return;}
  const pedidoIds=registros.map(r=>r.pedido_id).filter(Boolean);
  if(!pedidoIds.length){pel.innerHTML=vacio('Sin detalle disponible.');return;}
  const{data:items}=await sb.from('pedido_items').select('*').in('pedido_id',pedidoIds);
  const sorted=agruparItems(items).sort((a,b)=>b.total-a.total);
  pel.innerHTML=sorted.map((r,idx)=>filaRanking(idx,r)).join('');
}
async function resetCaja(){if(!confirm('¿Iniciar nueva jornada?'))return;showToast('Nueva jornada iniciada');renderCaja();}
