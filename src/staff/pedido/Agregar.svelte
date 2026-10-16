<script>
  import { e } from '../../lib/estado.svelte.js';
  import { ped, tocarProducto, limpiarSeleccion, confirmarAgregar, totalSeleccion, agregarItemCustom } from '../pedido.svelte.js';
  import { fmtPrice, fmtUSD } from '../../lib/formato.svelte.js';
  import { getCatIcon, categoriasDe } from '../../lib/catalogo.js';
  import { ocupado, showToast } from '../../lib/avisos.svelte.js';
  import ProdImg from '../../ui/ProdImg.svelte';
  import Vacio from '../../ui/Vacio.svelte';

  let q = $state('');
  let customAbierto = $state(false);
  let c = $state({ tipo: 'combo', nombre: '', total: '', cant: '', precio: '', unidad: '' });

  const filtrado = $derived(e.menu.filter(m => {
    const t = q.toLowerCase();
    return m.nombre.toLowerCase().includes(t) || m.categoria?.toLowerCase().includes(t);
  }));
  const cats = $derived(categoriasDe(filtrado));
  const sel = $derived(totalSeleccion());

  async function confirmar() {
    if (await confirmarAgregar()) q = '';
  }

  async function guardarCustom() {
    const nombre = c.nombre.trim();
    if (!nombre) { alert('Escribe el nombre'); return; }
    const cantidad = c.tipo === 'combo' ? parseInt(c.total) || 1 : parseInt(c.cant) || 1;
    const ok = await agregarItemCustom({ tipo: c.tipo, nombre, precio_usd: parseFloat(c.precio) || 0, unidad: c.unidad.trim() || 'und', cantidad });
    if (ok) { c = { tipo: 'combo', nombre: '', total: '', cant: '', precio: '', unidad: '' }; customAbierto = false; }
  }
</script>

<div id="mt-agregar">
  <input class="sbar" id="menu-search" placeholder="Buscar producto..." bind:value={q} />
  <div id="menu-picks">
    {#if !e.menu.length}
      <Vacio icono="ti-bottle">Menú vacío.</Vacio>
    {:else if !filtrado.length}
      <Vacio icono="ti-search">Sin resultados.</Vacio>
    {:else}
      {#each cats as cat (cat)}
        <div class="slabel">{getCatIcon(cat)} {cat}</div>
        <div class="menu-grid">
          {#each filtrado.filter(m => (m.categoria || 'General') === cat) as m (m.id)}
            {@const n = ped.seleccion[m.id] || 0}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="menu-grid-item" class:seleccionado={n} data-id={m.id} onclick={() => tocarProducto(m.id, 1)}>
              {#if n}
                <span class="mgi-cant">{n}</span>
                <button class="mgi-menos" onclick={ev => { ev.stopPropagation(); tocarProducto(m.id, -1); }} aria-label="Quitar uno">−</button>
              {/if}
              <ProdImg item={m} tam="grid" />
              <div class="mgi-name">{m.nombre}</div>
              <div class="mgi-price">{m.tipo === 'combo' ? fmtPrice(m.precio_usd * m.unidades_combo) + ' el combo' : fmtPrice(m.precio_usd)}</div>
              <span class="pill {m.tipo}">{m.tipo === 'combo' ? `Combo ${m.unidades_combo} ${m.unidad}s` : m.unidad}</span>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>

  {#if sel.n}
    <div id="barra-agregar" class="barra-agregar" style="display:flex">
      <button class="btn ghost" onclick={limpiarSeleccion}>Limpiar</button>
      <button class="btn primary crece" id="barra-agregar-btn" class:cargando={ocupado.agregar} disabled={ocupado.agregar} onclick={confirmar}><i class="ti ti-check"></i> Agregar {sel.n} · {fmtUSD(sel.usd)}</button>
    </div>
  {/if}

  <div class="mb-m"><button class="btn sm" onclick={() => (customAbierto = !customAbierto)}><i class="ti ti-pencil"></i> Producto personalizado</button></div>
  {#if customAbierto}
    <div id="custom-form" class="af">
      <div class="fg"><label for="tipo-item">Tipo</label>
        <select id="tipo-item" bind:value={c.tipo}><option value="combo">Combo</option><option value="suelto">Bebida suelta</option></select>
      </div>
      <div class="fg"><label for="item-nombre">Nombre</label><input id="item-nombre" placeholder="Nombre del producto" bind:value={c.nombre} /></div>
      {#if c.tipo === 'combo'}
        <div id="f-combo" class="fg"><label for="item-total">Total unidades</label><input id="item-total" type="number" placeholder="10" min="1" bind:value={c.total} /></div>
      {:else}
        <div id="f-suelto" class="fg"><label for="item-cant">Cantidad</label><input id="item-cant" type="number" placeholder="1" min="1" bind:value={c.cant} /></div>
      {/if}
      <div class="row2">
        <div class="fg"><label for="item-precio">Precio USD</label><input id="item-precio" type="number" placeholder="0.00" min="0" step="0.01" bind:value={c.precio} /></div>
        <div class="fg"><label for="item-unidad">Unidad</label><input id="item-unidad" placeholder="lata..." bind:value={c.unidad} /></div>
      </div>
      <div class="fa"><button class="btn primary" onclick={guardarCustom}><i class="ti ti-check"></i> Agregar</button></div>
    </div>
  {/if}
</div>
