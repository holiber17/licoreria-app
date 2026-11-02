<script>
  import { e } from '../lib/estado.svelte.js';
  import { fmtUSD, fmtEUR, fmtBs } from '../lib/formato.svelte.js';
  // Monto en la moneda elegida (o en todas)
  let { n } = $props();
</script>

{#if e.moneda === 'usd'}<span class="precio-uno">{fmtUSD(n)}</span>
{:else if e.moneda === 'eur'}<span class="precio-uno">{fmtEUR(n)}</span>
{:else if e.moneda === 'bs'}<span class="precio-uno">{fmtBs(n)}</span>
{:else}<div class="dp"><span class="pusd">{fmtUSD(n)} · {fmtEUR(n)}</span><span class="pbs">{fmtBs(n)}</span></div>{/if}
