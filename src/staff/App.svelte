<script>
  import { e } from '../lib/estado.svelte.js';
  import { iniciarSesion } from './sesion.svelte.js';
  import Toasts from '../ui/Toasts.svelte';
  import Acceso from './Acceso.svelte';
  import Espera from './Espera.svelte';
  import Shell from './Shell.svelte';

  iniciarSesion();
</script>

{#if e.pantalla === 'carga'}
  <div id="loading-screen" class="loading-screen" style="display:flex">
    <div class="marca-logo"><img src="icon.svg" alt="" /></div>
    <div class="spinner"></div>
    <span>Cargando...</span>
  </div>
{:else if e.pantalla === 'auth'}
  <Acceso />
{:else if e.pantalla === 'espera'}
  <Espera />
{:else}
  <Shell />
{/if}

<Toasts />
