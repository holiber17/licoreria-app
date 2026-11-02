<script>
  import { avisos, cerrarAviso } from '../lib/avisos.svelte.js';
  // Una pila arriba (avisos grandes) y otra abajo (cortos): se apilan en vez de taparse
  const alertas = $derived(avisos.lista.filter(a => a.clase === 'alerta'));
  const cortos = $derived(avisos.lista.filter(a => a.clase !== 'alerta'));
</script>

<div class="toasts arriba">
  {#each alertas as a (a.id)}
    <div class="toast alerta" role="alert" style="--ms:{a.ms}ms">
      <span class="ico"><i class="ti {a.icono}"></i></span>
      <span class="cuerpo">{@html a.html}</span>
      <button class="cerrar" onclick={() => cerrarAviso(a.id)} aria-label="Cerrar aviso"><i class="ti ti-x"></i></button>
      <span class="tiempo" aria-hidden="true"></span>
    </div>
  {/each}
</div>

<div class="toasts abajo">
  {#each cortos as a (a.id)}
    <!-- Se cierra al tocarlo; los errores se anuncian de inmediato a los lectores de pantalla -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div class="toast {a.clase}" role={a.clase === 'error' ? 'alert' : 'status'} onclick={() => cerrarAviso(a.id)}>
      <span class="ico"><i class="ti {a.icono}"></i></span>
      <span>{a.texto}</span>
    </div>
  {/each}
</div>
