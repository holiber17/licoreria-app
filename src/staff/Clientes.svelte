<script>
  import { e } from '../lib/estado.svelte.js';
  import { restGet, restInsert, restPatch, restDelete, itemsDePedidos } from '../lib/api.js';
  import { fmtUSD, resumenCaja, agruparItems } from '../lib/formato.svelte.js';
  import { ini, fmtHora } from '../lib/catalogo.js';
  import { showToast } from '../lib/avisos.svelte.js';
  import Metrica from '../ui/Metrica.svelte';
  import Monto from '../ui/Monto.svelte';
  import Ranking from '../ui/Ranking.svelte';
  import Nota from '../ui/Nota.svelte';
  import Vacio from '../ui/Vacio.svelte';
  import Hoja from '../ui/Hoja.svelte';

  const activa = $derived(e.seccion === 'clientes');
  let clientes = $state([]);
  let q = $state('');
  let formAbierto = $state(false);
  let nuevo = $state({ nombre: '', tel: '', notas: '' });
  let actual = $state(null);        // cliente cuyo historial se ve
  let hist = $state(null);          // {caja, items} (null = cargando)

  async function cargar() {
    if (!e.sucursal) return;
    clientes = await restGet('clientes?select=*&sucursal_id=eq.' + e.sucursal.id + '&order=nombre');
  }
  $effect(() => { if (activa) cargar(); });

  const lista = $derived(clientes.filter(c => c.nombre.toLowerCase().includes(q.toLowerCase()) || (c.telefono || '').includes(q)));

  async function guardar() {
    const nombre = nuevo.nombre.trim();
    if (!nombre) { alert('Escribe el nombre'); return; }
    await restInsert('clientes', { sucursal_id: e.sucursal.id, nombre, telefono: nuevo.tel.trim() || null, notas: nuevo.notas.trim() || null });
    nuevo = { nombre: '', tel: '', notas: '' }; formAbierto = false;
    showToast('Cliente guardado ✓');
    await cargar();
  }

  async function verHistorial(c) {
    actual = c; hist = null;
    // Pedidos cobrados con el nombre del cliente
    const caja = await restGet('caja?select=*&sucursal_id=eq.' + e.sucursal.id + '&cliente_nombre=eq.' + encodeURIComponent(c.nombre) + '&order=fecha.desc');
    const items = caja.length ? await itemsDePedidos(caja.map(x => x.pedido_id).filter(Boolean)) : [];
    if (actual?.id === c.id) hist = { caja, items };
  }
  const r = $derived(hist ? resumenCaja(hist.caja) : null);
  const favoritos = $derived(hist ? agruparItems(hist.items).sort((a, b) => b.cant - a.cant).slice(0, 5) : []);
  const ultima = $derived(hist?.caja.length
    ? new Date(hist.caja[0].fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' + fmtHora(hist.caja[0].fecha)
    : 'Nunca');

  async function editar() {
    const nombre = prompt('Nombre:', actual.nombre);
    if (!nombre) return;
    const telefono = prompt('Teléfono:', actual.telefono || '');
    const notas = prompt('Notas:', actual.notas || '');
    await restPatch('clientes', actual.id, { nombre, telefono: telefono || null, notas: notas || null });
    showToast('Cliente actualizado ✓');
    actual = null; await cargar();
  }
  async function eliminar() {
    if (!confirm('¿Eliminar a ' + actual.nombre + '? Se perderá su historial.')) return;
    await restDelete('clientes', actual.id);
    showToast('Cliente eliminado');
    actual = null; await cargar();
  }
</script>

<section id="sec-clientes" class="sec" class:active={activa}>
  <div class="top-bar">
    <h2>Clientes</h2>
    <button class="btn sm primary" onclick={() => (formAbierto = !formAbierto)}><i class="ti ti-plus"></i> Nuevo</button>
  </div>

  {#if formAbierto}
    <div id="cliente-form" class="af">
      <div class="fg"><label for="cf-nombre">Nombre</label><input id="cf-nombre" placeholder="Nombre del cliente" bind:value={nuevo.nombre} /></div>
      <div class="fg"><label for="cf-tel">Teléfono (opcional)</label><input id="cf-tel" type="tel" placeholder="+58 412 000 0000" bind:value={nuevo.tel} /></div>
      <div class="fg"><label for="cf-notas">Notas (opcional)</label><input id="cf-notas" placeholder="Ej: Cliente frecuente, prefiere ron..." bind:value={nuevo.notas} /></div>
      <div class="fa">
        <button class="btn sm ghost" onclick={() => (formAbierto = false)}>Cancelar</button>
        <button class="btn sm primary" onclick={guardar}><i class="ti ti-check"></i> Guardar</button>
      </div>
    </div>
  {/if}

  <input class="sbar" id="cli-search" placeholder="Buscar cliente o teléfono..." bind:value={q} />
  <div id="clientes-list">
    {#if !lista.length}
      <Vacio icono="ti-users">Sin clientes registrados.<br />Toca <strong>Nuevo</strong> para agregar.</Vacio>
    {:else}
      {#each lista as c (c.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="cli-card" onclick={() => verHistorial(c)}>
          <div class="fila">
            <div class="avatar">{ini(c.nombre)}</div>
            <div class="crece">
              <div class="t-fuerte recorta">{c.nombre}</div>
              <div class="t-sub recorta">{#if c.telefono}<i class="ti ti-phone"></i> {c.telefono}{:else}Sin teléfono{/if}{c.notas ? ' · ' + c.notas : ''}</div>
            </div>
            <i class="ti ti-chevron-right t-acento"></i>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <Hoja id="hist-modal" abierto={!!actual} alCerrar={() => (actual = null)} titulo={actual?.nombre || ''}>
    {#if actual}
      <div class="g2" id="hist-modal-metrics">
        {#if !r}<div class="spinner centro"></div>
        {:else}
          <Metrica label="Total gastado" valor={fmtUSD(r.totalUSD)} clase="success" destacada />
          <Metrica label="Visitas" valor={r.num} />
          <Metrica label="Ticket prom." valor={fmtUSD(r.ticket)} clase="sm" />
          <Metrica label="Última visita" valor={ultima} clase="xs" />
        {/if}
      </div>
      <div class="card">
        <div class="ch"><i class="ti ti-heart"></i> Productos favoritos</div>
        <div id="hist-modal-prods">
          {#if hist}
            {#if !hist.caja.length}<Nota>Sin visitas registradas.</Nota>
            {:else if !favoritos.length}<Nota>Sin datos.</Nota>
            {:else}{#each favoritos as x, idx (x.nombre)}<Ranking {idx} r={x} conBs={false} />{/each}{/if}
          {/if}
        </div>
      </div>
      <div class="card">
        <div class="ch"><i class="ti ti-calendar"></i> Últimas visitas</div>
        <div id="hist-modal-visitas">
          {#if hist}
            {#if !hist.caja.length}<Nota>Sin visitas registradas.</Nota>
            {:else}{#each hist.caja.slice(0, 8) as p (p.id)}
              <div class="res-row">
                <div class="crece">
                  <div class="t-fuerte">{new Date(p.fecha).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · {fmtHora(p.fecha)}</div>
                  <div class="t-mini">{p.metodo_pago || 'Efectivo'}{p.nota ? ' · ' + p.nota : ''}</div>
                </div>
                <Monto usd={p.total_usd} t={p.tasa_bcv} />
              </div>
            {/each}{/if}
          {/if}
        </div>
      </div>
      <div class="grupo-btn">
        <button class="btn sm" onclick={editar}><i class="ti ti-pencil"></i> Editar</button>
        <button class="btn sm danger" onclick={eliminar}><i class="ti ti-trash"></i> Eliminar</button>
      </div>
    {/if}
  </Hoja>
</section>
