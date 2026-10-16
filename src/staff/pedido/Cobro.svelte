<script>
  import { ped, cerrarCobro, cobrarPedido } from '../pedido.svelte.js';
  import { fmtUSD, fmtBs, fmtEUR, tasaEur, totalDe } from '../../lib/formato.svelte.js';
  import { ocupado } from '../../lib/avisos.svelte.js';
  import Hoja from '../../ui/Hoja.svelte';

  let nota = $state('');
  const metodos = [['Efectivo', 'ti-cash'], ['Pago móvil', 'ti-device-mobile'], ['Zelle', 'ti-building-bank'], ['Transferencia', 'ti-arrows-exchange']];
  const total = $derived(totalDe((ped.actual?.pedido_items || []).filter(i => i.consumido > 0)));
  $effect(() => { if (ped.cobroAbierto) nota = ''; });
</script>

<Hoja id="hoja-cobro" abierto={ped.cobroAbierto} alCerrar={cerrarCobro} titulo="Cobrar cuenta">
  <div class="cobro-total">
    <div class="t-mini" id="cobro-cliente">{ped.actual?.cliente_nombre || ''}</div>
    <div class="cobro-usd" id="cobro-usd">{fmtUSD(total)}</div>
    <div class="t-sub" id="cobro-bs">{fmtBs(total)}{tasaEur() ? ' · ' + fmtEUR(total) : ''}</div>
  </div>
  <div class="fg">
    <!-- svelte-ignore a11y_label_has_associated_control -->
    <label>¿Cómo pagó?</label>
    <div class="metodos">
      {#each metodos as [m, icono] (m)}
        <button class="metodo-btn" class:active={ped.metodo === m} id="mp-{m}" onclick={() => (ped.metodo = m)}><i class="ti {icono}"></i> {m}</button>
      {/each}
    </div>
  </div>
  <div class="fg"><label for="nota-cobro">Nota (opcional)</label>
    <input id="nota-cobro" placeholder="Ej: Pagó con billete de $20..." bind:value={nota} />
  </div>
  <button class="btn primary full grande" id="btn-confirmar-cobro" class:cargando={ocupado.cobrar} disabled={!ped.metodo || ocupado.cobrar} onclick={() => cobrarPedido(nota.trim())}>
    {#if ped.metodo}<i class="ti ti-check"></i> Cobrar {fmtUSD(total)} · {ped.metodo}{:else}Elige cómo pagó{/if}
  </button>
</Hoja>
