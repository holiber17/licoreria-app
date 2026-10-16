<script>
  import { ped, consumir, quitarItem, otroCombo, conCategoria } from '../pedido.svelte.js';
  import { fmtPrice, fmtUSD } from '../../lib/formato.svelte.js';
  import { ocupado } from '../../lib/avisos.svelte.js';
  import ProdImg from '../../ui/ProdImg.svelte';
  import Vacio from '../../ui/Vacio.svelte';

  const lista = $derived(ped.actual?.pedido_items || []);
</script>

<div id="consumo-list" class="card">
  {#if !lista.length}
    <Vacio icono="ti-glass">Sin productos todavía.<br />Toca <strong>Agregar</strong>.</Vacio>
  {:else}
    {#each lista as item (item.id)}
      {@const esCombo = item.tipo === 'combo'}
      {@const restante = item.total - item.consumido}
      {@const pct = item.total > 0 ? Math.round((item.consumido / item.total) * 100) : 0}
      {@const lleno = esCombo && restante <= 0}
      <div class="item-row">
        <ProdImg item={conCategoria(item)} tam="sm" />
        <div class="ii">
          <div class="in">{item.nombre}</div>
          <div class="is">
            {#if esCombo}
              {#if restante > 0}quedan <strong>{restante}</strong> de {item.total}{:else}<strong>combo terminado</strong>{/if} · {fmtPrice(item.precio_usd)} c/u
            {:else}
              {fmtPrice(item.precio_usd)} c/u · <strong>{fmtUSD(item.consumido * item.precio_usd)}</strong>
            {/if}
          </div>
          {#if esCombo}
            <div class="prog-bar"><div class="prog-fill {pct >= 100 ? 'full' : pct >= 70 ? 'warn' : 'acento'}" style="width:{pct}%"></div></div>
          {/if}
          {#if lleno}
            <button class="btn sm success mt-s" class:cargando={ocupado['combo-' + item.id]} disabled={ocupado['combo-' + item.id]} onclick={() => otroCombo(item.id)}><i class="ti ti-plus"></i> Otro combo igual</button>
          {/if}
        </div>
        <div class="counter">
          <button class="btn sm ghost ico" onclick={() => quitarItem(item.id)} aria-label="Quitar de la cuenta"><i class="ti ti-trash"></i></button>
          <button class="cbtn" onclick={() => consumir(item.id, -1)} aria-label="Uno menos">−</button>
          <span class="cval" title="Servidos">{item.consumido}</span>
          <button class="cbtn mas" onclick={() => consumir(item.id, 1)} aria-label={esCombo ? 'Servir uno' : 'Uno más'} disabled={lleno}>+</button>
        </div>
      </div>
    {/each}
  {/if}
</div>
