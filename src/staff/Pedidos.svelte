<script>
  import { e } from '../lib/estado.svelte.js';
  import { restGet } from '../lib/api.js';
  import { ped, cargarLista, crearPedido, abrirPedido, volverALista, abrirCobro } from './pedido.svelte.js';
  import { atenderSolicitud, avisosDePedido, SOL_TIPOS } from './solicitudes.svelte.js';
  import { ini, plural, fmtHora, hace } from '../lib/catalogo.js';
  import { totalDe } from '../lib/formato.svelte.js';
  import Dual from '../ui/Dual.svelte';
  import Vacio from '../ui/Vacio.svelte';
  import Consumo from './pedido/Consumo.svelte';
  import Agregar from './pedido/Agregar.svelte';
  import Cuenta from './pedido/Cuenta.svelte';
  import Cobro from './pedido/Cobro.svelte';
  import QR from './pedido/QR.svelte';
  import PdfCuenta from './PdfCuenta.svelte';

  let busqueda = $state('');
  let formNuevo = $state(false);
  let nombreNuevo = $state('');
  let clientes = $state([]);
  let qrAbierto = $state(false);
  let pdfAbierto = $state(false);

  const activa = $derived(e.seccion === 'pedidos');

  // La lista se refresca al entrar a la sección y cuando el tiempo real avisa de cambios
  $effect(() => {
    e.versionPedidos;
    if (activa && !ped.actual) cargarLista();
  });
  $effect(() => { e.pedidoAbierto = !!ped.actual; });

  const filtrados = $derived(ped.lista.filter(p => p.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase())));
  const sugeridos = $derived.by(() => {
    const q = nombreNuevo.trim().toLowerCase();
    if (q.length < 2) return [];
    return clientes.filter(c => c.nombre.toLowerCase().includes(q) && c.nombre.toLowerCase() !== q).slice(0, 4);
  });

  async function alternarNuevo() {
    formNuevo = !formNuevo;
    if (formNuevo && e.sucursal) {
      clientes = await restGet('clientes?select=id,nombre,telefono&sucursal_id=eq.' + e.sucursal.id + '&order=nombre');
      document.getElementById('nuevo-nombre')?.focus();
    }
  }
  async function crear() {
    const n = nombreNuevo.trim();
    if (!n) { alert('Escribe un nombre'); return; }
    if (await crearPedido(n)) { nombreNuevo = ''; formNuevo = false; }
  }
  const tabs = [['consumo', 'ti-glass', 'Consumo'], ['agregar', 'ti-plus', 'Agregar'], ['cuenta', 'ti-receipt', 'Cuenta']];
</script>

<section id="sec-pedidos" class="sec" class:active={activa}>
  <div id="s-lista" class="scr" class:active={!ped.actual}>
    {#if e.solicitudes.length}
      <div id="solicitudes-panel" class="card solicitudes" style="display:block">
        <div class="ch"><i class="ti ti-bell-ringing"></i> Avisos de clientes · {e.solicitudes.length}</div>
        {#each e.solicitudes as s (s.id)}
          {@const t = SOL_TIPOS[s.tipo] || SOL_TIPOS.mesonero}
          <div class="solicitud {s.tipo}">
            <i class="ti {t.icono} sol-icono"></i>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="crece" onclick={() => abrirPedido(s.pedido_id)}>
              <div class="t-fuerte recorta">{s.pedidos?.cliente_nombre || 'Pedido'}</div>
              <div class="t-sub">{t.texto}{s.metodo ? ' · ' + s.metodo : ''} · {hace(s.created_at)}</div>
            </div>
            <button class="btn sm success" onclick={() => atenderSolicitud(s.id)}><i class="ti ti-check"></i> Atendido</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="top-bar">
      <h2>Pedidos activos</h2>
      <button class="btn sm primary" onclick={alternarNuevo}><i class="ti ti-plus"></i> Nuevo</button>
    </div>
    {#if formNuevo}
      <div id="form-nuevo" class="af">
        <div class="fg"><label for="nuevo-nombre">Nombre del cliente, grupo o mesa</label>
          <input id="nuevo-nombre" placeholder="Ej: Carlos, Mesa 4..." autocomplete="off" bind:value={nombreNuevo} onkeydown={ev => ev.key === 'Enter' && crear()} />
        </div>
        {#if sugeridos.length}
          <div id="cliente-sugeridos" class="sugerencias" style="display:block">
            {#each sugeridos as c (c.id)}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <div class="sugerencia" onclick={() => (nombreNuevo = c.nombre)}>
                <div class="avatar sm">{ini(c.nombre)}</div>
                <div><div class="t-fuerte">{c.nombre}</div><div class="t-mini">{c.telefono || 'Sin teléfono'}</div></div>
              </div>
            {/each}
          </div>
        {/if}
        <div class="fa">
          <button class="btn sm ghost" onclick={alternarNuevo}>Cancelar</button>
          <button class="btn sm primary" onclick={crear}><i class="ti ti-check"></i> Abrir pedido</button>
        </div>
      </div>
    {/if}
    <input class="sbar" id="buscador" placeholder="Buscar pedido..." bind:value={busqueda} />
    <div id="pedidos-list">
      {#if !filtrados.length}
        <Vacio icono="ti-glass-full">Sin pedidos activos.<br />Toca <strong>Nuevo</strong> para abrir uno.</Vacio>
      {:else}
        <div class="lista-pedidos">
          {#each filtrados as p (p.id)}
            {@const its = p.pedido_items || []}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="cli-card activo" data-pedido={p.id} onclick={() => abrirPedido(p.id)}>
              <div class="avisos-tarjeta">
                {#each avisosDePedido(p.id) as tipo (tipo)}
                  {#if tipo === 'pagar'}<span class="aviso-tarjeta pagar"><i class="ti ti-wallet"></i> Quiere pagar</span>
                  {:else}<span class="aviso-tarjeta"><i class="ti ti-bell-ringing"></i> Te llama</span>{/if}
                {/each}
              </div>
              <div class="fila">
                <div class="avatar sm">{ini(p.cliente_nombre)}</div>
                <span class="nombre recorta crece">{p.cliente_nombre}</span>
              </div>
              <div class="pedido-total"><Dual n={totalDe(its)} /></div>
              <div class="t-mini mt-s"><i class="ti ti-clock"></i> {fmtHora(p.created_at)} · {its.length} {plural(its.length, 'ítem')}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div id="s-detalle" class="scr" class:active={!!ped.actual}>
    {#if ped.actual}
      <div class="top-bar">
        <button class="btn sm ghost" onclick={volverALista}><i class="ti ti-arrow-left"></i> Volver</button>
        <button class="btn sm primary" onclick={abrirCobro}><i class="ti ti-cash"></i> Cobrar</button>
      </div>
      <div class="det-cab">
        <div id="det-avatar" class="avatar">{ini(ped.actual.cliente_nombre)}</div>
        <div class="crece">
          <div id="det-nombre" class="det-nombre recorta">{ped.actual.cliente_nombre}</div>
          <div class="t-sub">Pedido abierto · <span id="det-tasa">BCV {e.tasaBCV.toFixed(2)}</span></div>
        </div>
        <button class="btn sm" onclick={() => (qrAbierto = true)} title="Compartir QR con el cliente"><i class="ti ti-qrcode"></i> QR</button>
      </div>

      <div class="itabs">
        {#each tabs as [id, icono, texto] (id)}
          <button class="itab" class:active={ped.tab === id} id="tab-{id}" onclick={() => (ped.tab = id)}><i class="ti {icono}"></i> {texto}</button>
        {/each}
      </div>
      {#if ped.tab === 'consumo'}<div id="mt-consumo"><Consumo /></div>{/if}
      {#if ped.tab === 'agregar'}<Agregar />{/if}
      {#if ped.tab === 'cuenta'}<Cuenta alExportar={() => (pdfAbierto = true)} />{/if}
    {/if}
  </div>

  <Cobro />
  <QR abierto={qrAbierto} alCerrar={() => (qrAbierto = false)} pedidoId={ped.actual?.id} />
  <PdfCuenta abierto={pdfAbierto} alCerrar={() => (pdfAbierto = false)} />
</section>
