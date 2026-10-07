// ==========================================================
// Clientes y su historial de consumo
// ==========================================================

let clientesList=[];
let clienteActual=null;

async function loadClientes(){
  if(!sucursalActual)return;
  clientesList=await restGet('clientes?select=*&sucursal_id=eq.'+sucursalActual.id+'&order=nombre');
  renderClientes();
}

function renderClientes(){
  const el=$('clientes-list');
  const q=($('cli-search')?.value||'').toLowerCase();
  const lista=clientesList.filter(c=>c.nombre.toLowerCase().includes(q)||(c.telefono||'').includes(q));
  if(!lista.length){
    el.innerHTML='<div class="empty"><i class="ti ti-users"></i>Sin clientes registrados.<br>Toca <strong>Nuevo</strong> para agregar.</div>';
    return;
  }
  el.innerHTML=lista.map(c=>`
    <div class="cli-card" onclick="verHistorial('${c.id}')">
      <div class="fila">
        <div class="avatar">${ini(c.nombre)}</div>
        <div class="crece">
          <div class="t-fuerte recorta">${esc(c.nombre)}</div>
          <div class="t-sub recorta">${c.telefono?'<i class="ti ti-phone"></i> '+esc(c.telefono):'Sin teléfono'}${c.notas?' · '+esc(c.notas):''}</div>
        </div>
        <i class="ti ti-chevron-right t-acento"></i>
      </div>
    </div>`).join('');
}

function toggleClienteForm(){if(alternar('cliente-form'))$('cf-nombre').focus();}

async function guardarCliente(){
  const nombre=$('cf-nombre').value.trim();
  const telefono=$('cf-tel').value.trim()||null;
  const notas=$('cf-notas').value.trim()||null;
  if(!nombre){alert('Escribe el nombre');return;}
  await restInsert('clientes',{sucursal_id:sucursalActual.id,nombre,telefono,notas});
  ['cf-nombre','cf-tel','cf-notas'].forEach(id=>$(id).value='');
  mostrar('cliente-form',false);
  showToast('Cliente guardado ✓');
  await loadClientes();
}

async function verHistorial(clienteId){
  clienteActual=clientesList.find(c=>c.id===clienteId);
  if(!clienteActual)return;
  $('hist-modal-nombre').textContent=clienteActual.nombre;
  $('hist-modal-metrics').innerHTML='<div class="spinner centro"></div>';
  $('hist-modal-prods').innerHTML='';
  $('hist-modal-visitas').innerHTML='';
  abrirModal('hist-modal');

  // Pedidos cobrados con el nombre del cliente
  const caja=await restGet('caja?select=*&sucursal_id=eq.'+sucursalActual.id+'&cliente_nombre=eq.'+encodeURIComponent(clienteActual.nombre)+'&order=fecha.desc');
  const r=resumenCaja(caja);
  const ultimaVisita=caja.length?new Date(caja[0].fecha).toLocaleDateString('es-VE',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+fmtHora(caja[0].fecha):'Nunca';

  $('hist-modal-metrics').innerHTML=
    metrica('Total gastado',fmtUSD(r.totalUSD),'success',true)+
    metrica('Visitas',r.num)+
    metrica('Ticket prom.',fmtUSD(r.ticket),'sm')+
    metrica('Última visita',ultimaVisita,'xs');

  // Productos favoritos
  if(caja.length){
    const items=await itemsDePedidos(caja.map(c=>c.pedido_id).filter(Boolean));
    const sorted=agruparItems(items).sort((a,b)=>b.cant-a.cant).slice(0,5);
    $('hist-modal-prods').innerHTML=sorted.length?sorted.map((r,idx)=>filaRanking(idx,r,false)).join(''):vacio('Sin datos.');
  } else {
    $('hist-modal-prods').innerHTML=vacio('Sin visitas registradas.');
  }

  // Últimas visitas
  $('hist-modal-visitas').innerHTML=caja.length?caja.slice(0,8).map(p=>`<div class="res-row">
    <div class="crece">
      <div class="t-fuerte">${new Date(p.fecha).toLocaleDateString('es-VE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})} · ${fmtHora(p.fecha)}</div>
      <div class="t-mini">${esc(p.metodo_pago||'Efectivo')}${p.nota?' · '+esc(p.nota):''}</div>
    </div>
    ${montoBloque(p.total_usd,p.tasa_bcv)}
  </div>`).join(''):vacio('Sin visitas registradas.');
}

function cerrarHistModal(){
  cerrarModal('hist-modal');
  clienteActual=null;
}

async function editarCliente(){
  if(!clienteActual)return;
  const nombre=prompt('Nombre:',clienteActual.nombre);
  if(!nombre)return;
  const telefono=prompt('Teléfono:',clienteActual.telefono||'');
  const notas=prompt('Notas:',clienteActual.notas||'');
  await restPatch('clientes',clienteActual.id,{nombre,telefono:telefono||null,notas:notas||null});
  showToast('Cliente actualizado ✓');
  cerrarHistModal();
  await loadClientes();
}

async function eliminarCliente(){
  if(!clienteActual)return;
  if(!confirm('¿Eliminar a '+clienteActual.nombre+'? Se perderá su historial.'))return;
  await restDelete('clientes',clienteActual.id);
  showToast('Cliente eliminado');
  cerrarHistModal();
  await loadClientes();
}
