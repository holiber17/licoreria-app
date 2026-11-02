<script>
  // Hoja modal: se cierra al tocar el fondo, la X o con Escape. Es un diálogo
  // para los lectores de pantalla y, al abrirse, el foco entra en ella.
  let { id, abierto = false, alCerrar, titulo = '', centro = false, children } = $props();
  let hoja = $state();
  function fondo(ev) { if (ev.target === ev.currentTarget) alCerrar?.(); }
  function tecla(ev) { if (abierto && ev.key === 'Escape') alCerrar?.(); }
  $effect(() => {
    if (!abierto || !hoja) return;
    const antes = document.activeElement;
    // Al primer campo, o a la hoja misma si no hay campos
    (hoja.querySelector('input, select, textarea') || hoja).focus({ preventScroll: true });
    return () => antes?.focus?.({ preventScroll: true });
  });
</script>

<svelte:window onkeydown={tecla} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div {id} class="modal" class:open={abierto} class:centro onclick={fondo} aria-hidden={!abierto}>
  <div class="hoja" bind:this={hoja} role="dialog" aria-modal="true" aria-label={titulo || undefined} tabindex="-1">
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
