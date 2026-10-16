<script>
  import { e } from '../lib/estado.svelte.js';
  import Sucursales from './admin/Sucursales.svelte';
  import Usuarios from './admin/Usuarios.svelte';
  import Reportes from './admin/Reportes.svelte';
  import Empleados from './admin/Empleados.svelte';

  const activa = $derived(e.seccion === 'admin');
  let tab = $state('sucursales');
  // Al volver a Admin se empieza en Sucursales, como antes
  $effect(() => { if (activa) tab = 'sucursales'; });
  const tabs = [['sucursales', 'Sucursales'], ['usuarios', 'Usuarios'], ['reportes', 'Reportes'], ['empleados', 'Empleados']];
</script>

<section id="sec-admin" class="sec" class:active={activa}>
  <div class="itabs">
    {#each tabs as [id, texto] (id)}
      <button class="itab" class:active={tab === id} id="atab-{id}" onclick={() => (tab = id)}>{texto}</button>
    {/each}
  </div>
  {#if activa}
    {#if tab === 'sucursales'}<Sucursales />{/if}
    {#if tab === 'usuarios'}<Usuarios />{/if}
    {#if tab === 'reportes'}<Reportes />{/if}
    {#if tab === 'empleados'}<Empleados />{/if}
  {/if}
</section>
