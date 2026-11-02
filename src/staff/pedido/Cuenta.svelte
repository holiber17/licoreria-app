<script>
  import { ped, abrirCobro, cancelarPedido } from '../pedido.svelte.js';
  import { totalDe } from '../../lib/formato.svelte.js';
  import Dual from '../../ui/Dual.svelte';
  import Nota from '../../ui/Nota.svelte';

  let { alExportar } = $props();
  const lista = $derived(ped.actual?.pedido_items || []);
  const total = $derived(totalDe(lista));
</script>

<div id="mt-cuenta">
  <div class="card">
    <div class="ch"><i class="ti ti-receipt"></i> Detalle de la cuenta</div>
    <div id="cuenta-list">
      {#if !lista.length}<Nota>Sin ítems.</Nota>
      {:else}
        {#each lista as item (item.id)}
          <div class="res-row"><span>{item.nombre} <span class="t-sub">× {item.consumido}</span></span><Dual n={item.consumido * item.precio_usd} /></div>
        {/each}
      {/if}
    </div>
    <div class="total-row"><span>Total</span><div id="cuenta-total">{#if lista.length}<Dual n={total} />{/if}</div></div>
  </div>
  <button class="btn primary full grande" onclick={abrirCobro}><i class="ti ti-cash"></i> Cobrar cuenta</button>
  <button class="btn full mt-s" onclick={alExportar}><i class="ti ti-file-text"></i> Exportar cuenta como PDF</button>
  <button class="btn ghost full mt-m t-error" onclick={cancelarPedido}><i class="ti ti-x"></i> Cancelar pedido sin cobrar</button>
</div>
