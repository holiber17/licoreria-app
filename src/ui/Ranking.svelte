<script>
  import { fmtUSD } from '../lib/formato.svelte.js';
  import Monto from './Monto.svelte';
  // Fila de ranking: posición, nombre, cantidad y monto
  let { idx, r, conBs = true } = $props();
  const medalla = $derived(idx === 0 ? 'oro' : idx === 1 ? 'plata' : idx === 2 ? 'bronce' : '');
</script>

<div class="res-row">
  <div class="fila crece"><span class="rank {medalla}">{idx + 1}</span>
    <span class="crece recorta"><span class="t-fuerte">{r.nombre}</span> <span class="t-sub">× {r.cant}</span></span></div>
  {#if conBs}<Monto usd={r.total} />{:else}<span class="monto-usd">{fmtUSD(r.total)}</span>{/if}
</div>
