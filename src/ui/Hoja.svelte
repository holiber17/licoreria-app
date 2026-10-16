<script>
  // Hoja modal: se cierra al tocar el fondo o la X
  let { id, abierto = false, alCerrar, titulo = '', centro = false, children } = $props();
  function fondo(ev) { if (ev.target === ev.currentTarget) alCerrar?.(); }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div {id} class="modal" class:open={abierto} class:centro onclick={fondo}>
  <div class="hoja">
    {#if titulo && !centro}
      <div class="hoja-cab">
        <span class="hoja-titulo">{titulo}</span>
        <button class="icon-btn" onclick={alCerrar} aria-label="Cerrar"><i class="ti ti-x"></i></button>
      </div>
    {:else if titulo}
      <div class="hoja-titulo">{titulo}</div>
    {/if}
    {@render children?.()}
  </div>
</div>
