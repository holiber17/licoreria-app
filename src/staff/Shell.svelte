<script>
  import { onMount } from 'svelte';
  import { LOGO_URL } from '../lib/config.js';
  import { e, setMoneda, esDueno } from '../lib/estado.svelte.js';
  import { tema, alternarTema } from '../lib/tema.svelte.js';
  import { doLogout } from './sesion.svelte.js';
  import { fetchBCV } from './tasas.svelte.js';
  import { loadMenu } from './menu.svelte.js';
  import { iniciarSolicitudes, detenerSolicitudes } from './solicitudes.svelte.js';
  import { pedirPermisoNotif } from './notificaciones.js';
  import Pedidos from './Pedidos.svelte';
  import Menu from './Menu.svelte';
  import Caja from './Caja.svelte';
  import Inventario from './Inventario.svelte';
  import Clientes from './Clientes.svelte';
  import Actividad from './Actividad.svelte';
  import Admin from './Admin.svelte';

  const nombre = $derived(e.sucursal?.app_nombre || e.sucursal?.nombre || 'LicorApp');
  let logoRoto = $state(false);
  let pantallaCompleta = $state(false);

  const secciones = $derived([
    { id: 'pedidos', icono: 'ti-glass-full', texto: 'Pedidos' },
    { id: 'menu', icono: 'ti-bottle', texto: 'Menú' },
    { id: 'caja', icono: 'ti-receipt-2', texto: 'Caja' },
    // "Mi actividad" existe (Actividad.svelte) pero, como en la versión anterior, su pestaña está oculta
    { id: 'inventario', icono: 'ti-packages', texto: 'Stock' },
    { id: 'clientes', icono: 'ti-users', texto: 'Clientes' },
    ...(esDueno() ? [{ id: 'admin', icono: 'ti-settings', texto: 'Admin' }] : []),
  ]);

  $effect(() => { document.title = nombre; });
  $effect(() => { e.sucursal?.logo_url; logoRoto = false; });

  // La pestaña activa se acerca al centro de la barra
  $effect(() => { document.getElementById('gnav-' + e.seccion)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' }); });

  onMount(() => {
    pedirPermisoNotif();
    loadMenu();
    fetchBCV();
    const t = setInterval(fetchBCV, 30 * 60 * 1000);
    iniciarSolicitudes();
    const fs = () => { pantallaCompleta = !!document.fullscreenElement; };
    document.addEventListener('fullscreenchange', fs);
    return () => { clearInterval(t); detenerSolicitudes(); document.removeEventListener('fullscreenchange', fs); };
  });

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        // Bloquear orientación horizontal en tablet si es posible
        if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {
        // Si no soporta fullscreen, modo kiosco visual
        document.body.classList.add('kiosco'); pantallaCompleta = true;
      });
    } else {
      document.exitFullscreen().then(() => { if (screen.orientation?.unlock) screen.orientation.unlock(); });
    }
  }

  const monedas = [['usd', 'USD'], ['eur', 'EUR'], ['bs', 'Bs'], ['both', 'Todas']];
</script>

<div id="app" class="shell" style="display:flex">
  <header class="hdr">
    <div class="hdr-top">
      <div class="marca">
        <div class="marca-logo" id="app-logo">
          {#if e.sucursal?.logo_url && !logoRoto}
            <img src={e.sucursal.logo_url} alt="" onerror={() => (logoRoto = true)} />
          {:else}<img src="icon.svg" alt="" />{/if}
        </div>
        <div class="marca-texto">
          <div class="marca-nombre" id="app-titulo">{nombre}</div>
          <div class="marca-sub" id="sucursal-badge">{e.sucursal?.nombre || ''}</div>
        </div>
      </div>
      <div class="hdr-actions">
        <button class="icon-btn" onclick={toggleFullscreen} id="fs-btn" title="Pantalla completa"><i class="ti {pantallaCompleta ? 'ti-minimize' : 'ti-maximize'}"></i></button>
        <button class="icon-btn" onclick={alternarTema} id="dark-btn" title="Cambiar tema"><i class="ti {tema.claro ? 'ti-moon' : 'ti-sun'}"></i></button>
        <button class="icon-btn" onclick={doLogout} title="Cerrar sesión"><i class="ti ti-logout"></i></button>
      </div>
    </div>
    <nav class="nav-tabs">
      {#each secciones as s (s.id)}
        <button class="nav-tab" class:active={e.seccion === s.id} id="gnav-{s.id}" onclick={() => (e.seccion = s.id)}>
          <i class="ti {s.icono}"></i> {s.texto}
          {#if s.id === 'pedidos' && e.solicitudes.length}<span class="nav-badge">{e.solicitudes.length}</span>{/if}
        </button>
      {/each}
    </nav>
  </header>

  <main class="content" class:en-pedido={e.seccion === 'pedidos' && e.pedidoAbierto}>
    <div class="tbar">
      <div class="tasas">
        <span class="rblk" title="Bolívares por 1 USD"><i class="ti ti-currency-dollar"></i><span class="moneda-cod">USD</span><input id="tasa-input" type="text" value={e.tasaBCV.toFixed(2)} readonly tabindex="-1" aria-readonly="true" /></span>
        <span class="rblk" title="Bolívares por 1 EUR"><i class="ti ti-currency-euro"></i><span class="moneda-cod">EUR</span><input id="tasa-eur-input" type="text" value={e.tasaEUR.toFixed(2)} readonly tabindex="-1" aria-readonly="true" /></span>
        <span id="tbadge" class="tbadge {e.tasaEstado.clase}"><i class="ti {e.tasaEstado.icono}"></i> {e.tasaEstado.texto}</span>
      </div>
      <div class="moneda-sel">
        <span>Mostrar en</span>
        <div class="mtoggle">
          {#each monedas as [clave, texto] (clave)}
            <button class="mtbtn" class:active={e.moneda === clave} id="m-{clave}" onclick={() => setMoneda(clave)}>{texto}</button>
          {/each}
        </div>
      </div>
    </div>

    <Pedidos />
    <Menu />
    <Caja />
    <Inventario />
    <Clientes />
    <Actividad />
    {#if esDueno()}<Admin />{/if}
  </main>
</div>
