<script>
  import { e } from '../../lib/estado.svelte.js';
  import { restGet, itemsDePedidos } from '../../lib/api.js';
  import { resumenCaja, agruparItems } from '../../lib/formato.svelte.js';
  import { plural } from '../../lib/catalogo.js';
  import Reporte from '../../ui/Reporte.svelte';
  import Monto from '../../ui/Monto.svelte';
  import Ranking from '../../ui/Ranking.svelte';
  import Nota from '../../ui/Nota.svelte';

  const METODO_ICONOS = { 'Efectivo': 'ti-cash', 'Zelle': 'ti-building-bank', 'Pago móvil': 'ti-device-mobile', 'Transferencia': 'ti-arrows-exchange' };
  let periodo = $state('semana');
  let caja = $state([]), tasas = $state([]), items = $state([]);

  async function cargar() {
    if (!e.sucursal) return;
    const hoy = new Date();
    const desde = new Date(hoy);
    if (periodo === 'semana') desde.setDate(hoy.getDate() - 7); else desde.setDate(1);
    const d = desde.toISOString().split('T')[0];
    const [c, t] = await Promise.all([
      restGet('caja?select=*&sucursal_id=eq.' + e.sucursal.id + '&fecha=gte.' + d + 'T00:00:00&order=fecha.asc'),
      restGet('tasas_bcv?select=*&sucursal_id=eq.' + e.sucursal.id + '&fecha=gte.' + d + '&order=fecha.desc'),
    ]);
    caja = c; tasas = t;
    items = await itemsDePedidos(c.map(x => x.pedido_id).filter(Boolean));
  }
  $effect(() => { periodo; cargar(); });

  const r = $derived(resumenCaja(caja));
  const top = $derived(agruparItems(items).sort((a, b) => b.total - a.total).slice(0, 10));
  const metodos = $derived.by(() => {
    const m = {};
    caja.forEach(p => {
      const k = p.metodo_pago || 'Efectivo';
      (m[k] ||= { total: 0, pedidos: 0 }); m[k].total += parseFloat(p.total_usd || 0); m[k].pedidos++;
    });
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  });
  const dias = $derived.by(() => {
    const m = {};
    caja.forEach(p => {
      const k = p.fecha.split('T')[0];
      (m[k] ||= { total: 0, pedidos: 0 }); m[k].total += parseFloat(p.total_usd || 0); m[k].pedidos++;
    });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  });
</script>

<div id="amt-reportes">
  <div class="top-bar"><h2>Reportes</h2></div>
  <div class="itabs">
    <button class="itab" class:active={periodo === 'semana'} id="rep-sem" onclick={() => (periodo = 'semana')}>Esta semana</button>
    <button class="itab" class:active={periodo === 'mes'} id="rep-mes" onclick={() => (periodo = 'mes')}>Este mes</button>
  </div>
  <div class="g2" id="rep-metrics"><Reporte {r} ticket="Ticket prom." /></div>
  <div class="card">
    <div class="ch"><i class="ti ti-credit-card"></i> Por método de pago</div>
    <div id="rep-metodos">
      {#if !metodos.length}<Nota>Sin ventas en este período.</Nota>
      {:else}{#each metodos as [m, d] (m)}
        <div class="res-row">
          <div class="fila crece"><i class="ti {METODO_ICONOS[m] || 'ti-credit-card'} t-acento" style="font-size:18px"></i>
            <span><span class="t-fuerte">{m}</span> <span class="t-sub">{d.pedidos} {plural(d.pedidos, 'pedido')}</span></span></div>
          <Monto usd={d.total} />
        </div>
      {/each}{/if}
    </div>
  </div>
  <div class="card">
    <div class="ch"><i class="ti ti-trophy"></i> Productos más vendidos</div>
    <div id="rep-productos">
      {#if !top.length}<Nota>Sin ventas en este período.</Nota>
      {:else}{#each top as x, idx (x.nombre)}<Ranking {idx} r={x} />{/each}{/if}
    </div>
  </div>
  <div class="card">
    <div class="ch"><i class="ti ti-calendar"></i> Ventas por día</div>
    <div id="rep-dias">
      {#if !dias.length}<Nota>Sin ventas en este período.</Nota>
      {:else}{#each dias as [dia, d] (dia)}
        <div class="res-row">
          <div class="crece">
            <div class="t-fuerte" style="text-transform:capitalize">{new Date(dia + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: '2-digit' })}</div>
            <div class="t-mini">{d.pedidos} {plural(d.pedidos, 'pedido')}</div>
          </div>
          <Monto usd={d.total} />
        </div>
      {/each}{/if}
    </div>
  </div>
  <div class="card">
    <div class="ch"><i class="ti ti-trending-up"></i> Tasa BCV — historial</div>
    <div id="rep-tasa-list">
      {#if !tasas.length}<Nota>Sin historial de tasas aún.</Nota>
      {:else}{#each tasas as t (t.fecha)}
        <div class="res-row">
          <span>{new Date(t.fecha + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
          <span class="t-fuerte">Bs {parseFloat(t.tasa).toFixed(2)}/$</span>
        </div>
      {/each}{/if}
    </div>
  </div>
</div>
