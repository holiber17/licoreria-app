<script>
  import { avisos } from '../lib/avisos.svelte.js';
</script>

{#each avisos.lista as a (a.id)}
  <div class="toast {a.clase}" style={a.arriba ? 'top:20px' : ''}>
    <i class="ti {a.icono}"></i>
    {#if a.html}<span>{@html a.html}</span>{:else}<span>{a.texto}</span>{/if}
  </div>
{/each}
