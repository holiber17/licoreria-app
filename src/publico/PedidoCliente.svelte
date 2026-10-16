<script>
  import { onMount } from 'svelte';
  import { LOGO_URL, clienteAnonimo } from '../lib/config.js';
  import { anonGet, anonInsert } from '../lib/api.js';
  import { ini } from '../lib/catalogo.js';
  import { toastAlerta, esc } from '../lib/avisos.svelte.js';
  import { tasas, fetchTasas, fmtUSD, fmtBs } from './comun.svelte.js';
  import ProdImg from '../ui/ProdImg.svelte';
  import Hoja from '../ui/Hoja.svelte';
  import Toasts from '../ui/Toasts.svelte';
  import FilaCopiable from './FilaCopiable.svelte';

  const pedidoId = new URLSearchParams(location.search).get('id');
  const ESPERA_MS = 60 * 1000;

  let pedido = $state(null);
  let sucursal = $state(null);
  let catalogo = $state({});        // menu_id / 'n:nombre' -> {categoria, imagen_url}
  let avisos = $state([]);          // avisos de este pedido
  let estado = $state(pedidoId ? 'cargando' : 'sinId');   // cargando | sinId | error | noEncontrado | ok
  let pagoAbierto = $state(false);
  let partes = $state(1);
  let metodoElegido = $state('');
  let ahora = $state(Date.now());
  let hasta = $state({ mesonero: lsEspera('mesonero'), pagar: lsEspera('pagar') });
  let tiempoReal = false;
  let anterior = {};
  let permiso = false;

  // ---- Espera entre avisos (se recuerda en el navegador) ----
  const claveEspera = tipo => 'sol_' + pedidoId + '_' + tipo;
  function lsEspera(tipo) {
    try { return parseInt(localStorage.getItem('sol_' + pedidoId + '_' + tipo) || '0') + ESPERA_MS; } catch (err) { return 0; }
  }
  const enEspera = tipo => ahora < hasta[tipo];

  // ---- Métodos de pago que el negocio configuró, más efectivo ----
  const METODOS = [
    { clave: 'pago_movil', nombre: 'Pago móvil', icono: 'ti-device-mobile', campos: [['banco', 'Banco'], ['telefono', 'Teléfono'], ['cedula', 'Cédula / RIF']], bs: true },
    { clave: 'transferencia', nombre: 'Transferencia', icono: 'ti-arrows-exchange', campos: [['banco', 'Banco'], ['cuenta', 'Cuenta'], ['titular', 'Titular'], ['cedula', 'Cédula / RIF']], bs: true },
    { clave: 'zelle', nombre: 'Zelle', icono: 'ti-building-bank', campos: [['correo', 'Correo'], ['titular', 'Titular']], bs: false },
    { clave: 'efectivo', nombre: 'Efectivo', icono: 'ti-cash', campos: [], bs: false },
  ];
  const disponibles = $derived.by(() => {
    const dp = sucursal?.datos_pago || {};
    return METODOS.filter(m => m.clave === 'efectivo' || Object.values(dp[m.clave] || {}).some(v => String(v || '').trim()));
  });

  // ---- Datos ----
  const items = $derived(pedido?.pedido_items || []);
  const totalUSD = $derived(items.reduce((s, i) => s + i.consumido * i.precio_usd, 0));
  const tasaPedido = $derived(parseFloat(pedido?.tasa_bcv) || tasas.usd);
  const abierto = $derived(pedido?.estado === 'abierto');
  const cobrado = $derived(pedido?.estado === 'cobrado');
  const nombreNegocio = $derived(sucursal ? (sucursal.app_nombre || sucursal.nombre) : '');
  $effect(() => { document.title = 'Mi pedido — ' + (nombreNegocio || 'LicorApp'); });
  let logoRoto = $state(false);

  async function cargarNegocio(sucursalId) {
    if (sucursal || !sucursalId) return;
    const id = encodeURIComponent(sucursalId);
    // datos_pago existe solo después de correr supabase/cliente.sql
    let d = await anonGet('sucursales?select=id,nombre,app_nombre,logo_url,datos_pago&id=eq.' + id);
    if (d === null) d = await anonGet('sucursales?select=id,nombre,app_nombre,logo_url&id=eq.' + id);
    if (!d || !d[0]) return;
    sucursal = d[0];
    // Categoría e imagen de cada producto, para mostrar su ícono
    const menu = await anonGet('menu?select=id,nombre,categoria,imagen_url&sucursal_id=eq.' + id);
    const c = {};
    (menu || []).forEach(m => { c[m.id] = m; c['n:' + m.nombre.toLowerCase()] = m; });
    catalogo = c;
  }
  function conCatalogo(item) {
    const m = catalogo[item.menu_id] || catalogo['n:' + String(item.nombre || '').toLowerCase()];
    return m ? { ...item, categoria: m.categoria, imagen_url: item.imagen_url || m.imagen_url } : item;
  }

  async function loadPedido() {
    if (!pedidoId) return;
    const data = await anonGet('pedidos?select=*,pedido_items(*)&id=eq.' + encodeURIComponent(pedidoId));
    if (data === null) { if (!pedido) estado = 'error'; return; }
    const p = data[0];
    if (!p) { estado = 'noEncontrado'; return; }
    await cargarNegocio(p.sucursal_id);
    avisos = (await anonGet('solicitudes?select=id,tipo,estado,created_at,atendida_at&pedido_id=eq.' + encodeURIComponent(pedidoId) + '&order=created_at.desc&limit=10')) || [];
    avisarSiAtendieron();
    pedido = p; estado = 'ok';
    checkNotifCliente(p.pedido_items || []);
  }

  // ---- Estado de los avisos ("Ya vienen") ----
  const ultimoAviso = tipo => avisos.find(a => a.tipo === tipo);
  const minutosDesde = f => Math.max(0, Math.round((ahora - new Date(f)) / 60000));
  const filasAviso = $derived.by(() => {
    const filas = [];
    const m = ultimoAviso('mesonero'), p = ultimoAviso('pagar');
    if (m && m.estado === 'pendiente') filas.push(['espera', 'ti-bell-ringing', `Le avisamos al mesonero${minutosDesde(m.created_at) ? ` · hace ${minutosDesde(m.created_at)} min` : ''}`]);
    else if (m && m.estado === 'atendida' && minutosDesde(m.atendida_at || m.created_at) < 10) filas.push(['ok', 'ti-walk', '¡Ya vienen! El mesonero vio tu llamado']);
    if (p && p.estado === 'pendiente') filas.push(['espera', 'ti-wallet', 'Avisaste que vas a pagar · un mesonero viene a confirmar']);
    else if (p && p.estado === 'atendida' && minutosDesde(p.atendida_at || p.created_at) < 15) filas.push(['ok', 'ti-circle-check', 'Un mesonero viene a confirmar tu pago']);
    return filas;
  });
  // Cuando un aviso pasa de pendiente a atendido, avisar al cliente
  function avisarSiAtendieron() {
    avisos.forEach(a => {
      if (anterior[a.id] === 'pendiente' && a.estado === 'atendida') {
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
        aviso('ti-walk', a.tipo === 'pagar' ? 'Un mesonero viene a confirmar tu pago' : '¡Ya vienen!');
      }
      anterior[a.id] = a.estado;
    });
  }
  function aviso(icono, html, ms = 4000) { toastAlerta(html, ms, icono, true); }

  // ---- Solicitudes al personal ----
  async function enviarSolicitud(tipo, metodo) {
    if (!pedido || pedido.estado !== 'abierto') return false;
    if (enEspera(tipo)) { aviso('ti-clock', 'Ya avisamos al personal.<br>En un momento te atienden.'); return false; }
    const ok = await anonInsert('solicitudes', { sucursal_id: pedido.sucursal_id, pedido_id: pedido.id, tipo, metodo: metodo || null });
    if (!ok) { aviso('ti-alert-triangle', 'No pudimos enviar el aviso.<br>Por favor llama a un mesonero.'); return false; }
    const t = Date.now();
    try { localStorage.setItem(claveEspera(tipo), String(t)); } catch (err) {}
    hasta[tipo] = t + ESPERA_MS;
    if (navigator.vibrate) navigator.vibrate(40);
    return true;
  }

  const mesoneroBloqueado = $derived(enEspera('mesonero') || ultimoAviso('mesonero')?.estado === 'pendiente');
  let enviandoMesonero = $state(false);
  async function llamarMesonero() {
    pedirPermiso();
    enviandoMesonero = true;
    if (await enviarSolicitud('mesonero')) {
      aviso('ti-bell-ringing', '¡Listo! Le avisamos al mesonero.');
      loadPedido();
    }
    enviandoMesonero = false;
  }

  // ---- Hoja de pago ----
  function abrirPago() {
    pedirPermiso();
    partes = 1;
    metodoElegido = disponibles.length === 1 ? disponibles[0].clave : (disponibles.find(m => m.clave !== 'efectivo')?.clave || 'efectivo');
    pagoAbierto = true;
  }
  const porPersona = $derived(totalUSD / partes);
  const montoBs = $derived(Math.round(porPersona * tasaPedido));
  const metodo = $derived(METODOS.find(x => x.clave === metodoElegido) || METODOS[3]);
  const datosMetodo = $derived((sucursal?.datos_pago || {})[metodo.clave] || {});
  const camposConDatos = $derived(metodo.campos.filter(([k]) => String(datosMetodo[k] || '').trim()));
  let enviandoPago = $state(false);
  async function avisarPago() {
    enviandoPago = true;
    const detalle = (metodo?.nombre || '') + (partes > 1 ? ` · entre ${partes}` : '');
    if (await enviarSolicitud('pagar', detalle)) {
      aviso('ti-wallet', '¡Listo! Ya le avisamos al personal.<br>En un momento confirman tu pago.');
      loadPedido();
    }
    enviandoPago = false;
  }

  // ---- Notificaciones de combos ----
  const leerVistos = () => { try { return new Set(JSON.parse(sessionStorage.getItem('notif_' + pedidoId) || '[]')); } catch (err) { return new Set(); } };
  const notificadosYa = leerVistos();
  const guardarVistos = () => { try { sessionStorage.setItem('notif_' + pedidoId, JSON.stringify([...notificadosYa])); } catch (err) {} };

  async function pedirPermiso() {
    if (!('Notification' in window) || permiso) return;
    if (Notification.permission === 'granted') { permiso = true; return; }
    if (Notification.permission !== 'denied') permiso = (await Notification.requestPermission()) === 'granted';
  }
  function alertaSonido() {
    try {
      const c = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784].forEach((freq, i) => {
        const o = c.createOscillator(); const g = c.createGain();
        o.connect(g); g.connect(c.destination); o.frequency.value = freq;
        g.gain.setValueAtTime(.15, c.currentTime + i * .15);
        g.gain.exponentialRampToValueAtTime(.001, c.currentTime + i * .15 + .12);
        o.start(c.currentTime + i * .15); o.stop(c.currentTime + i * .15 + .12);
      });
    } catch (err) {}
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  function checkNotifCliente(lista) {
    lista.forEach(item => {
      if (item.tipo !== 'combo') return;
      const restante = item.total - item.consumido;
      const key = item.id + '_ultima';
      if (restante === 1 && !notificadosYa.has(key)) {
        notificadosYa.add(key); guardarVistos(); alertaSonido();
        aviso('ti-alert-triangle', '¡Última unidad de<br><strong>' + esc(item.nombre) + '</strong>!', 6000);
        if (permiso) new Notification('⚠️ ¡Última unidad!', { body: 'Solo queda 1 ' + item.unidad + ' de ' + item.nombre, icon: LOGO_URL, tag: key, requireInteraction: true });
      }
      const keyFull = item.id + '_agotado';
      if (restante === 0 && !notificadosYa.has(keyFull)) {
        notificadosYa.add(keyFull); guardarVistos(); alertaSonido();
        aviso('ti-ban', 'Se terminó tu combo<br><strong>' + esc(item.nombre) + '</strong>', 6000);
        if (permiso) new Notification('🚫 Se terminó el combo', { body: item.nombre + ' — no quedan unidades', icon: LOGO_URL, tag: keyFull, requireInteraction: true });
      }
    });
  }

  // ---- Tiempo real: si está disponible la página se actualiza al instante; si no, consulta cada 10 s ----
  function iniciarTiempoReal() {
    if (!pedidoId) return;
    try {
      const cli = clienteAnonimo();
      let t = null;
      const refrescar = () => { clearTimeout(t); t = setTimeout(loadPedido, 250); };
      const f = 'pedido_id=eq.' + pedidoId;
      cli.channel('pedido-' + pedidoId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items', filter: f }, refrescar)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: 'id=eq.' + pedidoId }, refrescar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitudes', filter: f }, refrescar)
        .subscribe(s => { tiempoReal = s === 'SUBSCRIBED'; });
    } catch (err) { tiempoReal = false; }
  }

  onMount(() => {
    // El permiso de notificaciones se pide al tocar un botón, no al abrir
    if ('Notification' in window && Notification.permission === 'granted') permiso = true;
    fetchTasas().then(loadPedido);
    iniciarTiempoReal();
    // Respaldo: cada 10 s sin tiempo real; cada 60 s con tiempo real (tasa y borrados)
    let vueltas = 0;
    const respaldo = setInterval(async () => {
      vueltas++;
      if (tiempoReal && vueltas % 6 !== 0) return;
      await fetchTasas(); await loadPedido();
    }, 10000);
    const reloj = setInterval(() => { ahora = Date.now(); }, 1000);
    window.__licor = { ...(window.__licor || {}), loadPedido };
    return () => { clearInterval(respaldo); clearInterval(reloj); };
  });
</script>

<div class="shell">
  <header class="hdr">
    <div class="marca">
      <img id="negocio-logo" src={sucursal?.logo_url && !logoRoto ? sucursal.logo_url : 'icon.svg'} alt="" onerror={() => (logoRoto = true)} />
      <h1 id="negocio-nombre">{nombreNegocio || 'Tu pedido'}</h1>
    </div>
    <div class="live-badge" class:cobrado={pedido && !abierto} id="live-badge">
      {#if cobrado}<i class="ti ti-check"></i> Cobrado
      {:else if pedido && !abierto}Cerrado
      {:else}<span class="live-dot"></span> En vivo{/if}
    </div>
  </header>

  <main class="content" id="content">
    {#if estado === 'cargando'}
      <div class="loading"><div class="spinner"></div><span>Cargando tu pedido...</span></div>
    {:else if estado === 'sinId'}
      <div class="empty"><i class="ti ti-alert-triangle"></i>Pedido no encontrado.<br />Escanea el QR nuevamente.</div>
    {:else if estado === 'error'}
      <div class="empty"><i class="ti ti-wifi-off"></i>Error de conexión.<br />Intenta de nuevo.</div>
    {:else if estado === 'noEncontrado'}
      <div class="empty"><i class="ti ti-receipt-off"></i>Pedido no encontrado.</div>
    {:else if pedido}
      <div class="cliente-header">
        <div class="avatar lg">{ini(pedido.cliente_nombre)}</div>
        <div class="cliente-nombre">{pedido.cliente_nombre}</div>
        <div class="cliente-sub">{abierto ? 'Pedido activo' : 'Pedido cerrado'}</div>
      </div>

      {#if cobrado}
        <div class="cobrado-banner">
          <i class="ti ti-circle-check"></i>
          <p>¡Gracias por tu visita!</p>
          {#if pedido.nota}<div class="t-sub" style="color:inherit;margin-top:4px">{pedido.nota}</div>{/if}
        </div>
      {/if}

      <div class="total-box">
        <div class="total-label">{cobrado ? 'Total pagado' : 'Total hasta ahora'}</div>
        <div class="total-usd">{fmtUSD(totalUSD)}</div>
        <div class="total-bs">{fmtBs(totalUSD, tasaPedido)}</div>
      </div>

      {#if abierto}
        {#each filasAviso as [clase, icono, texto] (texto)}
          <div class="estado-aviso {clase}"><i class="ti {icono}"></i><span>{texto}</span></div>
        {/each}
        <div class="acciones-cliente">
          <button class="btn grande" id="btn-mesonero" disabled={mesoneroBloqueado || enviandoMesonero} onclick={llamarMesonero}>
            {#if mesoneroBloqueado}<i class="ti ti-check"></i> Ya le avisamos{:else}<i class="ti ti-bell-ringing"></i> Llamar al mesonero{/if}
          </button>
          <button class="btn primary grande" onclick={abrirPago}><i class="ti ti-wallet"></i> Quiero pagar</button>
        </div>
      {/if}

      {#if !items.length}
        <div class="empty"><i class="ti ti-glass"></i>Todavía no hay nada en tu pedido.</div>
      {:else}
        <div class="card"><div class="ch"><i class="ti ti-receipt"></i> Lo que llevas · {items.length} {items.length === 1 ? 'producto' : 'productos'}</div>
          {#each items as item (item.id)}
            {@const esCombo = item.tipo === 'combo'}
            {@const restante = item.total - item.consumido}
            {@const pct = item.total > 0 ? Math.round((item.consumido / item.total) * 100) : 0}
            {@const sub = item.consumido * item.precio_usd}
            <div class="item-row">
              <ProdImg item={conCatalogo(item)} tam="sm" />
              <div class="item-info">
                <div class="item-name">{item.nombre}</div>
                <div class="item-sub">
                  {#if esCombo}
                    <span class="restante-badge {pct >= 100 ? 'rb-full' : pct >= 70 ? 'rb-warn' : 'rb-ok'}">{restante > 0 ? `Te ${restante === 1 ? 'queda' : 'quedan'} ${restante} de ${item.total}` : 'Combo terminado'}</span>
                  {:else}{item.consumido} {item.unidad}{item.consumido !== 1 ? 's' : ''}{/if}
                </div>
                {#if esCombo}<div class="prog-bar"><div class="prog-fill {pct >= 100 ? 'full' : pct >= 70 ? 'warn' : ''}" style="width:{pct}%"></div></div>{/if}
              </div>
              <div class="monto">
                <div class="monto-usd neutro">{fmtUSD(sub)}</div>
                <div class="monto-bs">{fmtBs(sub, tasaPedido)}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="pie-tasa">Tasa BCV del pedido: Bs {tasaPedido.toFixed(2)} por $</div>
      {#if pedido.sucursal_id}
        <a class="btn full" href="carta.html?s={encodeURIComponent(pedido.sucursal_id)}"><i class="ti ti-book"></i> Ver la carta y precios</a>
      {/if}
    {/if}
  </main>

  <footer class="footer">Se actualiza al instante · <strong>LicorApp</strong></footer>
</div>

<Hoja id="hoja-pago" abierto={pagoAbierto} alCerrar={() => (pagoAbierto = false)} titulo="Pagar la cuenta">
  <div id="pago-cuerpo">
    <div class="pago-total">
      <div class="t-mini">{partes > 1 ? `Cada persona paga (entre ${partes})` : 'Total a pagar'}</div>
      <div class="pago-usd">{fmtUSD(porPersona)}</div>
      <div class="pago-bs">Bs {montoBs.toLocaleString('es-VE')}</div>
    </div>
    <div class="dividir">
      <span><i class="ti ti-users"></i> Dividir la cuenta</span>
      <div class="contador">
        <button class="cbtn" onclick={() => (partes = Math.max(1, partes - 1))} aria-label="Menos personas">−</button>
        <span class="cval">{partes}</span>
        <button class="cbtn" onclick={() => (partes = Math.min(20, partes + 1))} aria-label="Más personas">+</button>
      </div>
    </div>
    <div class="ch mt-m"><i class="ti ti-credit-card"></i> ¿Cómo vas a pagar?</div>
    <div class="metodos">
      {#each disponibles as x (x.clave)}
        <button class="metodo-btn" class:active={x.clave === metodo.clave} onclick={() => (metodoElegido = x.clave)}><i class="ti {x.icono}"></i> {x.nombre}</button>
      {/each}
    </div>

    {#if camposConDatos.length}
      <div class="datos-pago">
        {#each camposConDatos as [k, etiqueta] (k)}<FilaCopiable {etiqueta} valor={String(datosMetodo[k]).trim()} />{/each}
        {#if metodo.bs}<FilaCopiable etiqueta="Monto en Bs" valor={String(montoBs)} />
        {:else}<FilaCopiable etiqueta="Monto en $" valor={porPersona.toFixed(2)} />{/if}
      </div>
    {:else if metodo.clave === 'efectivo'}
      <p class="t-sub mt-m">Paga en efectivo directamente al personal. Avísales para que te traigan la cuenta.</p>
    {/if}

    <button class="btn primary full grande mt-m" id="btn-avisar-pago" disabled={enEspera('pagar') || enviandoPago} onclick={avisarPago}>
      {#if enEspera('pagar')}<i class="ti ti-check"></i> Ya avisamos al personal{:else}<i class="ti ti-send"></i> Avisar que voy a pagar{/if}
    </button>
    <p class="t-mini mt-s" style="text-align:center">Un mesonero confirmará tu pago antes de cerrar la cuenta.</p>
  </div>
</Hoja>

<Toasts />
