<script>
  import { fmtUSD, fmtBsCon } from '../lib/formato.svelte.js';
  // Monto en USD con su equivalente en Bs (a la tasa indicada)
  let { usd, t, neutro = false } = $props();
</script>

<div class="monto">
  <div class="monto-usd" class:neutro>{fmtUSD(usd)}</div>
  <div class="monto-bs">{fmtBsCon(usd, t)}</div>
</div>
