<script>
  import { avisos, cerrarAviso } from '../lib/avisos.svelte.js';
</script>

{#each avisos.lista as a (a.id)}
  <!-- Se cierra al tocarlo; los errores se anuncian de inmediato a los lectores de pantalla -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <div class="toast {a.clase}" style={a.arriba ? 'top:20px' : ''} role={a.clase === 'error' ? 'alert' : 'status'} onclick={() => cerrarAviso(a.id)}>
    <i class="ti {a.icono}"></i>
    {#if a.html}<span>{@html a.html}</span>{:else}<span>{a.texto}</span>{/if}
  </div>
{/each}
