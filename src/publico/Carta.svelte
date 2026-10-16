<script>
  import { onMount } from 'svelte';
  import { anonGet } from '../lib/api.js';
  import { ordenarMenu, getCatIcon, categoriasDe } from '../lib/catalogo.js';
  import { tasas, fetchTasas, fmtUSD, fmtBs, fmtEUR } from './comun.svelte.js';
  import ProdImg from '../ui/ProdImg.svelte';
  import Toasts from '../ui/Toasts.svelte';

  const sucursalId = new URLSearchParams(location.search).get('s');
  let negocio = $state(null);
  let productos = $state([]);
  let agotados = $state(new Set());
  let categoria = $state('');
  let q = $state('');
  let estado = $state('cargando');   // cargando | sinEnlace | error | vacia | ok
  let moneda = $state((() => { try { return localStorage.getItem('carta_moneda') || 'usd'; } catch (err) { return 'usd'; } })());

  const nombreNegocio = $derived(negocio ? (negocio.app_nombre || negocio.nombre) : '');
  $effect(() => { if (nombreNegocio) document.title = 'Carta — ' + nombreNegocio; });

  function setMoneda(m) { moneda = m; try { localStorage.setItem('carta_moneda', m); } catch (err) {} }
  const principal = n => (moneda === 'bs' ? fmtBs(n) : moneda === 'eur' && tasas.eur ? fmtEUR(n) : fmtUSD(n));
  const secundario = n => (moneda === 'bs' ? fmtUSD(n) : fmtBs(n));

  const cats = $derived(categoriasDe(productos));
  const lista = $derived(productos.filter(p => {
    const t = q.toLowerCase().trim();
    return (!categoria || (p.categoria || 'General') === categoria) && (!t || p.nombre.toLowerCase().includes(t) || (p.categoria || '').toLowerCase().includes(t));
  }));
  const gruposLista = $derived(categoriasDe(lista));

  onMount(async () => {
    if (!sucursalId) { estado = 'sinEnlace'; return; }
    const id = encodeURIComponent(sucursalId);
    const [suc, menu, inv] = await Promise.all([
      anonGet('sucursales?select=nombre,app_nombre,logo_url,ciudad,direccion&id=eq.' + id),
      anonGet('menu?select=nombre,tipo,precio_usd,unidad,categoria,unidades_combo,imagen_url&sucursal_id=eq.' + id + '&activo=eq.true&order=categoria,nombre'),
      anonGet('inventario?select=nombre,stock_actual&sucursal_id=eq.' + id),
      fetchTasas(),
    ]);
    negocio = suc && suc[0] || null;
    // El stock solo se ve si el dueño lo hizo público (ver supabase/cliente.sql)
    agotados = new Set((inv || []).filter(i => parseFloat(i.stock_actual) <= 0).map(i => String(i.nombre).toLowerCase()));
    if (menu === null) { estado = 'error'; return; }
    if (!menu.length) { estado = 'vacia'; return; }
    productos = ordenarMenu(menu);
    estado = 'ok';
  });

  let logoRoto = $state(false);
  const pie = $derived(negocio && (negocio.direccion || negocio.ciudad)
    ? [negocio.direccion, negocio.ciudad].filter(Boolean).join(', ') : '');
</script>

<div class="shell">
  <header class="hdr">
    <div class="marca">
      <img id="negocio-logo" src={negocio?.logo_url && !logoRoto ? negocio.logo_url : 'icon.svg'} alt="" onerror={() => (logoRoto = true)} />
      <h1 id="negocio-nombre">{nombreNegocio || 'Nuestra carta'}</h1>
    </div>
    <div class="mtoggle" role="group" aria-label="Moneda">
      {#each [['usd', '$'], ['bs', 'Bs'], ['eur', '€']] as [m, t] (m)}
        <button class="mtbtn" class:active={moneda === m} id="cm-{m}" onclick={() => setMoneda(m)}>{t}</button>
      {/each}
    </div>
  </header>

  <main class="content">
    <section class="carta-hero">
      <div class="carta-lema">Carta del día</div>
      <div class="carta-titulo">Precios actualizados</div>
      <div class="carta-tasa" id="carta-tasa">
        {#if estado === 'cargando'}Cargando tasa…{:else}Tasa BCV: Bs {tasas.usd.toFixed(2)} por ${tasas.eur ? ` · Bs ${tasas.eur.toFixed(2)} por €` : ''}{/if}
      </div>
    </section>

    <div class="carta-filtros">
      <input class="sbar" id="carta-buscar" placeholder="Buscar ron, cerveza, combo..." bind:value={q} />
      <div class="chips" id="carta-chips">
        {#if productos.length}
          <button class="chip" class:active={categoria === ''} onclick={() => (categoria = '')}>Todo</button>
          {#each cats as c (c)}<button class="chip" class:active={categoria === c} onclick={() => (categoria = c)}>{getCatIcon(c)} {c}</button>{/each}
        {/if}
      </div>
    </div>

    <div id="carta-lista">
      {#if estado === 'cargando'}
        <div class="loading"><div class="spinner"></div><span>Cargando la carta...</span></div>
      {:else if estado === 'sinEnlace'}
        <div class="empty"><i class="ti ti-alert-triangle"></i>Enlace incompleto.<br />Pide el enlace de la carta al local.</div>
      {:else if estado === 'error'}
        <div class="empty"><i class="ti ti-wifi-off"></i>No pudimos cargar la carta.<br />Intenta de nuevo en un momento.</div>
      {:else if estado === 'vacia'}
        <div class="empty"><i class="ti ti-bottle"></i>La carta está vacía por ahora.</div>
      {:else if !lista.length}
        <div class="empty"><i class="ti ti-search"></i>No encontramos ese producto.</div>
      {:else}
        {#each gruposLista as c (c)}
          <section>
            <div class="slabel">{getCatIcon(c)} {c}</div>
            <div class="carta-grid">
              {#each lista.filter(p => (p.categoria || 'General') === c) as p (p.nombre)}
                {@const agotado = agotados.has(p.nombre.toLowerCase())}
                <article class="carta-item" class:agotado>
                  <div class="carta-foto"><ProdImg item={p} tam="carta" />{#if agotado}<span class="carta-agotado">Agotado</span>{/if}</div>
                  <div class="carta-info">
                    <div class="carta-nombre">{p.nombre}</div>
                    <div class="carta-detalle">{p.tipo === 'combo' ? `Combo · ${p.unidades_combo} ${p.unidad}s` : `Por ${p.unidad}`}</div>
                    <div class="carta-precio">{principal(p.precio_usd)}<span>{secundario(p.precio_usd)}</span></div>
                    {#if p.tipo === 'combo'}<div class="carta-combo">Combo completo: {principal(p.precio_usd * p.unidades_combo)}</div>{/if}
                  </div>
                </article>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </div>
  </main>

  <footer class="footer" id="carta-pie">
    {#if pie}<i class="ti ti-map-pin"></i> {pie}<br />Precios a la tasa oficial BCV · <strong>{nombreNegocio}</strong>
    {:else}Precios en dólares a la tasa oficial BCV · <strong>LicorApp</strong>{/if}
  </footer>
</div>

<Toasts />
