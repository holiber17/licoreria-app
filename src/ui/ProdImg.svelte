<script>
  import { getCatIcon } from '../lib/catalogo.js';
  // Imagen del producto o, si falla o no hay, el icono de su categoría
  let { item, tam = 'md' } = $props();
  let fallo = $state(false);
  const clases = {
    sm: ['prod-img-sm', 'cat-icon-sm'],
    grid: ['mgi-img', 'mgi-icon'],
    md: ['prod-img', 'cat-icon'],
    carta: ['carta-img', 'carta-icono'],
  };
  const [claseImg, claseIcono] = $derived(clases[tam] || clases.md);
  $effect(() => { item.imagen_url; fallo = false; });
</script>

{#if item.imagen_url && !fallo}
  <img class={claseImg} src={item.imagen_url} alt={item.nombre} loading="lazy" onerror={() => (fallo = true)} />
{:else}
  <div class={claseIcono}>{getCatIcon(item.categoria || 'default')}</div>
{/if}
