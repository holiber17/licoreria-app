<script>
  import { e } from '../lib/estado.svelte.js';
  import { sb } from '../lib/config.js';
  import { restPatch } from '../lib/api.js';
  import { loadMenu } from './menu.svelte.js';
  import { fmtPrice } from '../lib/formato.svelte.js';
  import { getCatIcon, categoriasDe } from '../lib/catalogo.js';
  import { showToast } from '../lib/avisos.svelte.js';
  import ProdImg from '../ui/ProdImg.svelte';
  import Vacio from '../ui/Vacio.svelte';
  import Hoja from '../ui/Hoja.svelte';

  const activa = $derived(e.seccion === 'menu');
  let q = $state('');
  let formAbierto = $state(false);
  let nuevo = $state({ tipo: 'combo', nombre: '', total: '', precio: '', unidad: '', cat: '' });
  let ed = $state(null);   // producto en edición (copia con campos de formulario)

  $effect(() => { if (activa) loadMenu(); });

  const filtrado = $derived(e.menu.filter(m => {
    const t = q.toLowerCase();
    return m.nombre.toLowerCase().includes(t) || m.categoria?.toLowerCase().includes(t);
  }));
  const cats = $derived(categoriasDe(filtrado));

  async function guardarNuevo() {
    const nombre = nuevo.nombre.trim();
    if (!nombre) { alert('Escribe el nombre'); return; }
    await sb.from('menu').insert({
      sucursal_id: e.sucursal.id, nombre, tipo: nuevo.tipo, precio_usd: parseFloat(nuevo.precio) || 0,
      unidad: nuevo.unidad.trim() || 'und', categoria: nuevo.cat.trim() || 'General',
      unidades_combo: nuevo.tipo === 'combo' ? parseInt(nuevo.total) || 1 : 1, activo: true,
    });
    nuevo = { tipo: 'combo', nombre: '', total: '', precio: '', unidad: '', cat: '' };
    formAbierto = false;
    await loadMenu(); showToast('Producto agregado ✓');
  }

  function editar(m) {
    ed = { id: m.id, tipo: m.tipo, nombre: m.nombre, total: m.unidades_combo || 1, precio: m.precio_usd, unidad: m.unidad, cat: m.categoria || '', imagen: m.imagen_url || '' };
  }
  async function guardarEdicion() {
    const nombre = ed.nombre.trim();
    if (!nombre) { alert('Escribe el nombre'); return; }
    await restPatch('menu', ed.id, {
      nombre, tipo: ed.tipo, precio_usd: parseFloat(ed.precio) || 0, unidad: String(ed.unidad).trim() || 'und',
      categoria: String(ed.cat).trim() || 'General', unidades_combo: ed.tipo === 'combo' ? parseInt(ed.total) || 1 : 1,
      imagen_url: String(ed.imagen).trim() || null,
    });
    ed = null;
    await loadMenu(); showToast('Producto actualizado ✓');
  }
  async function eliminar(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    await restPatch('menu', id, { activo: false });
    await loadMenu();
  }
</script>

<section id="sec-menu" class="sec" class:active={activa}>
  <div class="top-bar"><h2>Menú</h2><button class="btn sm primary" onclick={() => (formAbierto = !formAbierto)}><i class="ti ti-plus"></i> Producto</button></div>
  {#if formAbierto}
    <div id="menu-form" class="af">
      <div class="fg"><label for="mf-tipo">Tipo</label>
        <select id="mf-tipo" bind:value={nuevo.tipo}><option value="combo">Combo</option><option value="suelto">Bebida suelta</option></select>
      </div>
      <div class="fg"><label for="mf-nombre">Nombre</label><input id="mf-nombre" placeholder="Ej: Combo Polar x12..." bind:value={nuevo.nombre} /></div>
      {#if nuevo.tipo === 'combo'}
        <div id="mf-combo-f" class="fg"><label for="mf-total">Unidades por combo</label><input id="mf-total" type="number" placeholder="12" min="1" bind:value={nuevo.total} /></div>
      {/if}
      <div class="fg"><label for="mf-precio">Precio por unidad (USD $)</label><input id="mf-precio" type="number" placeholder="0.00" min="0" step="0.01" bind:value={nuevo.precio} /></div>
      <div class="row2">
        <div class="fg"><label for="mf-unidad">Unidad</label><input id="mf-unidad" placeholder="lata, botella..." bind:value={nuevo.unidad} /></div>
        <div class="fg"><label for="mf-cat">Categoría</label><input id="mf-cat" placeholder="Cerveza, Ron..." bind:value={nuevo.cat} /></div>
      </div>
      <div class="fa">
        <button class="btn sm ghost" onclick={() => (formAbierto = false)}>Cancelar</button>
        <button class="btn sm primary" onclick={guardarNuevo}><i class="ti ti-check"></i> Guardar</button>
      </div>
    </div>
  {/if}
  <input class="sbar" id="menu-filter" placeholder="Buscar en el menú..." bind:value={q} />
  <div id="menu-list">
    {#if !e.menu.length}
      <Vacio icono="ti-bottle">Menú vacío.<br />Agrega tu primer producto.</Vacio>
    {:else if !filtrado.length}
      <Vacio icono="ti-search">Sin resultados.</Vacio>
    {:else}
      {#each cats as cat (cat)}
        {@const items = filtrado.filter(m => (m.categoria || 'General') === cat)}
        <div class="card"><div class="ch">{getCatIcon(cat)} {cat} <span class="t-mini">· {items.length}</span></div>
          {#each items as m (m.id)}
            <div class="mi">
              <ProdImg item={m} tam="sm" />
              <div class="crece">
                <div class="menu-prod-nombre">{m.nombre} <span class="pill {m.tipo}">{m.tipo === 'combo' ? 'Combo' : 'Suelta'}</span></div>
                <div class="t-sub" style="margin-top:3px">{m.tipo === 'combo' ? m.unidades_combo + ' ' + m.unidad + 's · ' : ''}{fmtPrice(m.precio_usd)} por {m.unidad}</div>
              </div>
              <div class="fila gap-s">
                <button class="btn sm ico" onclick={() => editar(m)} aria-label="Editar"><i class="ti ti-pencil"></i></button>
                <button class="btn sm danger ico" onclick={() => eliminar(m.id)} aria-label="Eliminar"><i class="ti ti-trash"></i></button>
              </div>
            </div>
          {/each}
        </div>
      {/each}
    {/if}
  </div>

  <Hoja id="edit-modal" abierto={!!ed} alCerrar={() => (ed = null)} titulo="Editar producto">
    {#if ed}
      <div class="fg"><label for="ef-tipo">Tipo</label>
        <select id="ef-tipo" bind:value={ed.tipo}><option value="combo">Combo</option><option value="suelto">Bebida suelta</option></select>
      </div>
      <div class="fg"><label for="ef-nombre">Nombre</label><input id="ef-nombre" placeholder="Nombre del producto" bind:value={ed.nombre} /></div>
      {#if ed.tipo === 'combo'}
        <div id="ef-combo-f" class="fg"><label for="ef-total">Unidades por combo</label><input id="ef-total" type="number" placeholder="12" min="1" bind:value={ed.total} /></div>
      {/if}
      <div class="fg"><label for="ef-precio">Precio por unidad (USD $)</label><input id="ef-precio" type="number" placeholder="0.00" min="0" step="0.01" bind:value={ed.precio} /></div>
      <div class="row2">
        <div class="fg"><label for="ef-unidad">Unidad</label><input id="ef-unidad" placeholder="lata, botella..." bind:value={ed.unidad} /></div>
        <div class="fg"><label for="ef-cat">Categoría</label><input id="ef-cat" placeholder="Cerveza, Ron..." bind:value={ed.cat} /></div>
      </div>
      <div class="fg"><label for="ef-imagen">URL de imagen (opcional)</label><input id="ef-imagen" placeholder="https://..." bind:value={ed.imagen} /></div>
      {#if ed.imagen.trim()}<div id="ef-preview"><img id="ef-preview-img" class="preview-img" src={ed.imagen.trim()} alt="Vista previa" /></div>{/if}
      <div class="fa">
        <button class="btn ghost" onclick={() => (ed = null)}>Cancelar</button>
        <button class="btn primary" onclick={guardarEdicion}><i class="ti ti-check"></i> Guardar cambios</button>
      </div>
    {/if}
  </Hoja>
</section>
