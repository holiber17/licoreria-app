<script>
  import { e } from '../lib/estado.svelte.js';
  import { restGet, itemsDePedidos } from '../lib/api.js';
  import { resumenCaja, agruparItems, fechaCorta } from '../lib/formato.svelte.js';
  import Reporte from '../ui/Reporte.svelte';
  import Monto from '../ui/Monto.svelte';
  import Ranking from '../ui/Ranking.svelte';
  import Nota from '../ui/Nota.svelte';
  import { desde } from './periodos.js';

  const activa = $derived(e.seccion === 'actividad');
  let periodo = $state('hoy');
  let caja = $state([]);
  let items = $state([]);

  const r = $derived(resumenCaja(caja));
  const horas = $derived.by(() => {
    const h = {};
    caja.forEach(p => { const k = new Date(p.fecha).getHours(); h[k] = (h[k] || 0) + 1; });
    return Object.entries(h).sort((a, b) => a[0] - b[0]);
  });
  const maxH = $derived(Math.max(1, ...horas.map(x => x[1])));
  const top = $derived(agruparItems(items).sort((a, b) => b.total - a.total).slice(0, 5));

  async function cargar() {
    if (!e.user || !e.sucursal) return;
    caja = await restGet('caja?select=*&sucursal_id=eq.' + e.sucursal.id + '&usuario_id=eq.' + e.user.id + '&fecha=gte.' + desde(periodo) + '&order=fecha.desc');
    items = await itemsDePedidos(caja.map(c => c.pedido_id).filter(Boolean));
  }
  $effect(() => { periodo; if (activa) cargar(); });
</script>

<section id="sec-actividad" class="sec" class:active={activa}>
  <div class="top-bar"><h2>Mi actividad</h2></div>
  <div class="itabs">
    {#each [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']] as [id, texto] (id)}
      <button class="itab" class:active={periodo === id} id="act-{id.substring(0, 3)}" onclick={() => (periodo = id)}>{texto}</button>
    {/each}
  </div>
  <div class="g2" id="act-metrics"><Reporte {r} usd="Mis ventas USD" bs="Mis ventas Bs" pedidos="Pedidos atendidos" /></div>
  <div class="card">
    <div class="ch"><i class="ti ti-clock"></i> Horario de actividad</div>
    <div id="act-horario">
      {#if !horas.length}<Nota>Sin actividad en este período.</Nota>
      {:else}{#each horas as [h, c] (h)}
        <div class="barra-hora"><span class="h">{h}:00 h</span><div class="pista"><div class="relleno" style="width:{Math.round(c / maxH * 100)}%"></div></div><span class="c">{c}</span></div>
      {/each}{/if}
    </div>
  </div>
  <div class="card">
    <div class="ch"><i class="ti ti-list-details"></i> Mis pedidos</div>
    <div id="act-pedidos">
      {#if !caja.length}<Nota>Sin pedidos en este período.</Nota>
      {:else}{#each caja.slice(0, 10) as p (p.id)}
        <div class="res-row">
          <div class="crece"><div class="t-fuerte recorta">{p.cliente_nombre}</div><div class="t-mini">{fechaCorta(p.fecha)} · {p.metodo_pago || 'Efectivo'}</div></div>
          <Monto usd={p.total_usd} t={p.tasa_bcv} />
        </div>
      {/each}{/if}
    </div>
  </div>
  <div class="card">
    <div class="ch"><i class="ti ti-trophy"></i> Mis productos más vendidos</div>
    <div id="act-productos">
      {#if !top.length}<Nota>Sin datos.</Nota>
      {:else}{#each top as x, idx (x.nombre)}<Ranking {idx} r={x} conBs={false} />{/each}{/if}
    </div>
  </div>
</section>
