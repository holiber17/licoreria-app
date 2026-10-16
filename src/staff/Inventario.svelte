<script>
  import { sb } from '../lib/config.js';
  import { e } from '../lib/estado.svelte.js';
  import { restGet, restInsert, restPatch, restDelete } from '../lib/api.js';
  import { feedback } from '../lib/sonidos.js';
  import { showToast, enCurso, ocupado } from '../lib/avisos.svelte.js';
  import { msgError } from '../lib/catalogo.js';
  import { loadMenu } from './menu.svelte.js';
  import Vacio from '../ui/Vacio.svelte';
  import Hoja from '../ui/Hoja.svelte';
  import Escaner from './Escaner.svelte';

  const activa = $derived(e.seccion === 'inventario');
  let items = $state([]);
  let q = $state('');
  let formAbierto = $state(false);
  let nuevo = $state(formVacio());
  let mov = $state(null);          // {id, nombre, tipo, cantidad, motivo}
  let escaner = $state(null);      // null | {alCodigo}

  function formVacio() { return { nombre: '', codigo: '', stock: '', min: '', unidad: 'botella', menu: '', porCaja: false, upc: '' }; }

  async function cargar() {
    if (!e.sucursal) return;
    items = await restGet('inventario?select=*&sucursal_id=eq.' + e.sucursal.id + '&order=nombre');
  }
  $effect(() => { if (activa) { loadMenu(); cargar(); } });

  // Estado del stock de un producto: sin stock, última unidad, bajo u ok
  function estadoStock(i) {
    const pct = i.stock_minimo > 0 ? Math.min(i.stock_actual / i.stock_minimo * 100, 100) : 100;
    if (i.stock_actual <= 0) return { pct, clase: 'error', barra: 'full', msg: 'Sin stock', icono: 'ti-ban' };
    if (i.stock_actual <= 1) return { pct, clase: 'aviso', barra: 'warn', msg: 'Última unidad', icono: 'ti-alert-triangle' };
    if (pct <= 20) return { pct, clase: 'aviso', barra: 'warn', msg: 'Stock bajo', icono: 'ti-trending-down' };
    return { pct, clase: 'ok', barra: '', msg: '', icono: '' };
  }

  const alertas = $derived(items.filter(i => {
    const pct = i.stock_minimo > 0 ? i.stock_actual / i.stock_minimo : 1;
    return i.stock_actual <= 1 || pct <= 0.2 || i.stock_actual <= 0;
  }));
  const lista = $derived(items.filter(i => i.nombre.toLowerCase().includes(q.toLowerCase()) || (i.codigo_barra || '').includes(q)));

  async function enlazarMenu(inv, menuId) {
    const r = await restPatch('inventario', inv.id, { menu_id: menuId || null });
    if (!r.ok) { showToast('No se pudo enlazar', 'danger'); return; }
    inv.menu_id = menuId || null;
    showToast(menuId ? 'Enlazado: se descontará al vender ✓' : 'Enlace quitado');
  }

  async function guardar() {
    const f = nuevo;
    const nombre = f.nombre.trim();
    if (!nombre) { alert('Escribe el nombre'); return; }
    const stock = parseFloat(f.stock) || 0;
    const ok = await enCurso('guardar-inv', async () => {
      // Se crea en 0 y el stock inicial entra como movimiento, así queda en el historial
      const r = await restInsert('inventario', {
        sucursal_id: e.sucursal.id, menu_id: f.menu || null, nombre, codigo_barra: f.codigo.trim() || null,
        stock_actual: 0, stock_minimo: parseFloat(f.min) || 5, unidad: f.unidad, por_caja: f.porCaja, unidades_por_caja: parseInt(f.upc) || 1,
      }, 'return=representation');
      if (!r.ok) { showToast('No se pudo guardar el producto', 'danger'); return false; }
      const creado = (await r.json())[0];
      if (stock > 0 && creado) {
        const { error } = await sb.rpc('mover_stock', { p_inventario: creado.id, p_tipo: 'entrada', p_cantidad: stock, p_motivo: 'Stock inicial' });
        if (error) showToast('Producto creado, pero no se registró el stock inicial', 'danger');
      }
      return true;
    });
    if (!ok) return;
    nuevo = formVacio(); formAbierto = false;
    showToast('Producto agregado al inventario ✓');
    await cargar();
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este producto del inventario?')) return;
    await restDelete('inventario', id);
    await cargar();
  }

  // ---- Movimientos ----
  const TITULOS = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' };
  function abrirMov(inv, tipo) {
    mov = { id: inv.id, nombre: inv.nombre, tipo, cantidad: '', motivo: '' };
    setTimeout(() => document.getElementById('mov-cantidad')?.focus(), 150);
  }
  // La suma/resta ocurre dentro de Supabase (función mover_stock), así dos teléfonos no se pisan el stock.
  async function guardarMov() {
    const valor = String(mov.cantidad ?? '').trim();
    const cantidad = parseFloat(valor);
    const valida = valor !== '' && !isNaN(cantidad) && (cantidad > 0 || (mov.tipo === 'ajuste' && cantidad === 0));
    if (!valida) { alert(mov.tipo === 'ajuste' ? 'Ingresa el stock real (puede ser 0)' : 'Ingresa una cantidad mayor que 0'); return; }
    await enCurso('mover-stock', async () => {
      const { data, error } = await sb.rpc('mover_stock', { p_inventario: mov.id, p_tipo: mov.tipo, p_cantidad: cantidad, p_motivo: mov.motivo.trim() });
      if (error) { showToast(msgError(error, 'No se pudo registrar'), 'danger'); return; }
      mov = null;
      showToast(`Movimiento registrado · stock: ${data} ✓`);
      await cargar();
      feedback();
    });
  }

  // ---- Escáner ----
  function escanearParaForm() { escaner = { alCodigo: c => { nuevo.codigo = c; } }; }
  function escanearBuscar() {
    escaner = {
      alCodigo: codigo => {
        const existe = items.find(i => i.codigo_barra === codigo);
        if (existe) { showToast('Producto encontrado: ' + existe.nombre); abrirMov(existe, 'entrada'); }
        else if (confirm(`Código: ${codigo}\n\nNo encontrado en inventario. ¿Agregar como nuevo producto?`)) {
          formAbierto = true; nuevo.codigo = codigo;
          setTimeout(() => document.getElementById('if-nombre')?.focus(), 50);
        }
      },
    };
  }
</script>

<section id="sec-inventario" class="sec" class:active={activa}>
  <div class="top-bar">
    <h2>Inventario</h2>
    <div class="acciones">
      <button class="btn sm" onclick={escanearBuscar}><i class="ti ti-barcode"></i> Escanear</button>
      <button class="btn sm primary" onclick={() => (formAbierto = !formAbierto)}><i class="ti ti-plus"></i> Agregar</button>
    </div>
  </div>

  {#if alertas.length}
    <div id="inv-alertas" class="card aviso" style="display:block">
      <div class="ch t-aviso"><i class="ti ti-alert-triangle"></i> Stock bajo</div>
      <div id="inv-alertas-list">
        {#each alertas as i (i.id)}
          {@const s = estadoStock(i)}
          <div class="res-row"><span class="fila gap-s"><i class="ti {s.icono || 'ti-trending-down'} t-{s.clase === 'ok' ? 'aviso' : s.clase}"></i>{i.nombre}</span>
            <span class="t-fuerte t-aviso">{i.stock_actual} {i.unidad}{i.stock_actual !== 1 ? 's' : ''} — {s.msg || 'Stock bajo'}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if formAbierto}
    <div id="inv-form" class="af">
      <div class="fg"><label for="if-nombre">Nombre del producto</label><input id="if-nombre" placeholder="Ej: Ron Cacique 750ml" bind:value={nuevo.nombre} /></div>
      <div class="fg"><label for="if-codigo">Código de barra (opcional)</label>
        <div class="fila gap-s">
          <input id="if-codigo" class="campo" placeholder="Ej: 7750175000015" bind:value={nuevo.codigo} />
          <button class="btn" onclick={escanearParaForm} title="Escanear"><i class="ti ti-barcode"></i></button>
        </div>
      </div>
      <div class="row2">
        <div class="fg"><label for="if-stock">Stock inicial</label><input id="if-stock" type="number" placeholder="0" min="0" step="0.5" bind:value={nuevo.stock} /></div>
        <div class="fg"><label for="if-min">Stock mínimo</label><input id="if-min" type="number" placeholder="5" min="0" step="0.5" bind:value={nuevo.min} /></div>
      </div>
      <div class="fg"><label for="if-unidad">Unidad</label>
        <select id="if-unidad" bind:value={nuevo.unidad}>
          <option value="botella">Botella</option><option value="lata">Lata</option><option value="caja">Caja</option><option value="litro">Litro</option><option value="trago">Trago</option>
        </select>
      </div>
      <div class="fg"><label for="if-menu">Se descuenta al vender (producto del menú)</label>
        <select id="if-menu" bind:value={nuevo.menu}>
          <option value="">Sin enlazar</option>
          {#each e.menu as m (m.id)}<option value={m.id}>{m.nombre}</option>{/each}
        </select>
      </div>
      <label class="fg-check"><input type="checkbox" id="if-porcaja" bind:checked={nuevo.porCaja} /> Manejar por caja</label>
      {#if nuevo.porCaja}
        <div id="if-caja-fields"><div class="fg"><label for="if-upc">Unidades por caja</label><input id="if-upc" type="number" placeholder="12" min="1" bind:value={nuevo.upc} /></div></div>
      {/if}
      <div class="fa">
        <button class="btn sm ghost" onclick={() => (formAbierto = false)}>Cancelar</button>
        <button class="btn sm primary" class:cargando={ocupado['guardar-inv']} disabled={ocupado['guardar-inv']} onclick={guardar}><i class="ti ti-check"></i> Guardar</button>
      </div>
    </div>
  {/if}

  <input class="sbar" id="inv-search" placeholder="Buscar producto o código..." bind:value={q} />
  <div id="inv-list">
    {#if !lista.length}
      <Vacio icono="ti-packages">Sin productos en inventario.<br />Agrega uno o escanea un código.</Vacio>
    {:else}
      {#each lista as i (i.id)}
        {@const s = estadoStock(i)}
        <div class="card">
          <div class="fila">
            <div class="crece">
              <div class="t-fuerte">{i.nombre}</div>
              <div class="t-sub">{#if i.codigo_barra}<i class="ti ti-barcode"></i> {i.codigo_barra} · {/if}{#if i.por_caja}Caja de {i.unidades_por_caja} · {/if}Mín: {i.stock_minimo} {i.unidad}s</div>
            </div>
            <div class="der">
              <div class="stock-num {s.clase}">{i.stock_actual}</div>
              <div class="t-mini">{i.unidad}{i.stock_actual !== 1 ? 's' : ''}</div>
            </div>
          </div>
          <div class="prog-bar mb-m"><div class="prog-fill {s.barra}" style="width:{s.pct}%"></div></div>
          <label class="enlace-menu"><i class="ti ti-link"></i><span>Se descuenta al vender</span>
            <select class="campo sm" value={i.menu_id || ''} onchange={ev => enlazarMenu(i, ev.currentTarget.value)}>
              <option value="">Sin enlazar</option>
              {#each e.menu as m (m.id)}<option value={m.id}>{m.nombre}</option>{/each}
            </select>
          </label>
          <div class="fila gap-s">
            <button class="btn sm success crece" onclick={() => abrirMov(i, 'entrada')}><i class="ti ti-plus"></i> Entrada</button>
            <button class="btn sm danger crece" onclick={() => abrirMov(i, 'salida')}><i class="ti ti-minus"></i> Salida</button>
            <button class="btn sm ico" onclick={() => abrirMov(i, 'ajuste')} aria-label="Ajustar"><i class="ti ti-adjustments"></i></button>
            <button class="btn sm danger ico" onclick={() => eliminar(i.id)} aria-label="Eliminar"><i class="ti ti-trash"></i></button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <Hoja id="mov-modal" abierto={!!mov} alCerrar={() => (mov = null)} titulo={mov ? (TITULOS[mov.tipo] || 'Movimiento') + ' — ' + mov.nombre : 'Registrar movimiento'}>
    {#if mov}
      <div class="itabs">
        {#each [['entrada', 'ti-package-import', 'Entrada'], ['salida', 'ti-package-export', 'Salida'], ['ajuste', 'ti-adjustments', 'Ajuste']] as [id, icono, texto] (id)}
          <button class="itab" class:active={mov.tipo === id} id="mov-{id}" onclick={() => (mov.tipo = id)}><i class="ti {icono}"></i> {texto}</button>
        {/each}
      </div>
      <div class="fg"><label for="mov-cantidad">Cantidad</label><input id="mov-cantidad" type="number" inputmode="decimal" placeholder="0" min="0" step="0.5" bind:value={mov.cantidad} /></div>
      <div class="fg"><label for="mov-motivo">Motivo (opcional)</label><input id="mov-motivo" placeholder="Ej: Compra a proveedor, venta manual..." bind:value={mov.motivo} /></div>
      <div class="fa">
        <button class="btn ghost" onclick={() => (mov = null)}>Cancelar</button>
        <button class="btn primary" class:cargando={ocupado['mover-stock']} disabled={ocupado['mover-stock']} onclick={guardarMov}><i class="ti ti-check"></i> Registrar</button>
      </div>
    {/if}
  </Hoja>

  {#if escaner}
    <Escaner alCodigo={c => { const f = escaner.alCodigo; escaner = null; f(c); }} alCerrar={() => (escaner = null)} />
  {/if}
</section>
