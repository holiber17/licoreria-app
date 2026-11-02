<script>
  import { fmtUSD, fmtBsTotal } from '../lib/formato.svelte.js';
  import Metrica from './Metrica.svelte';
  // Cuatro métricas de un resumen de caja
  let { r, usd = 'Total USD', bs = 'Total Bs', pedidos = 'Pedidos', ticket = 'Ticket promedio' } = $props();
</script>

<Metrica label={usd} valor={fmtUSD(r.totalUSD)} clase="success" destacada />
<Metrica label={bs} valor={fmtBsTotal(r.totalBs)} clase="success sm" />
<Metrica label={pedidos} valor={r.num} />
<Metrica label={ticket} valor={fmtUSD(r.ticket)} clase="sm" />
