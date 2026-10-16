<script>
  import { sb } from '../../lib/config.js';
  import { untrack } from 'svelte';
  import { e, nombreNegocio } from '../../lib/estado.svelte.js';
  import { rest, restGet, restInsert, restPatch } from '../../lib/api.js';
  import { showToast } from '../../lib/avisos.svelte.js';
  import { copiarTexto } from '../../lib/catalogo.js';
  import { loadMenu } from '../menu.svelte.js';
  import { reiniciarSolicitudes } from '../solicitudes.svelte.js';
  import { abrirWhatsApp } from '../comprobantes.js';
  import Vacio from '../../ui/Vacio.svelte';

  let sucursales = $state([]);
  let formAbierto = $state(false);
  let nueva = $state({ nombre: '', ciudad: '', dir: '' });

  async function cargar() {
    sucursales = await restGet('sucursales?select=id,nombre,ciudad,direccion,activa,logo_url,app_nombre&order=created_at');
  }

  async function guardar() {
    const nombre = nueva.nombre.trim();
    if (!nombre) { alert('Escribe el nombre'); return; }
    await sb.from('sucursales').insert({ nombre, ciudad: nueva.ciudad.trim(), direccion: nueva.dir.trim(), activa: true });
    nueva = { nombre: '', ciudad: '', dir: '' }; formAbierto = false;
    showToast('Sucursal creada ✓'); cargar();
  }

  async function cambiar(s) {
    await sb.from('perfiles').update({ sucursal_id: s.id }).eq('id', e.user.id);
    e.sucursal = { ...s };
    showToast('Sucursal: ' + s.nombre);
    await loadMenu();
    e.versionPedidos++;
    reiniciarSolicitudes();
    cargar();
  }

  // ---- Marca del negocio ----
  let marca = $state({ nombre: '', url: '' });
  let logoBase64 = null;
  let vistaArchivo = $state('');

  function cargarMarca() {
    marca.nombre = e.sucursal?.app_nombre || '';
    marca.url = e.sucursal?.logo_url || '';
    vistaArchivo = '';
  }
  function elegirArchivo(ev) {
    const f = ev.currentTarget.files[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = x => { logoBase64 = x.target.result; vistaArchivo = logoBase64; marca.url = ''; };
    lector.readAsDataURL(f);
  }
  function alEscribirUrl() { logoBase64 = null; vistaArchivo = ''; }
  const imagenVista = $derived(vistaArchivo || marca.url.trim());

  async function guardarMarca() {
    if (!e.sucursal) return;
    const nombre = marca.nombre.trim();
    const logoUrl = logoBase64 || marca.url.trim() || null;
    if (!nombre && !logoUrl) { showToast('Ingresa un nombre o logo', 'danger'); return; }
    const cambios = {};
    if (nombre) cambios.app_nombre = nombre;
    if (logoUrl) cambios.logo_url = logoUrl;
    const res = await restPatch('sucursales', e.sucursal.id, cambios);
    if (res.ok) {
      e.sucursal = { ...e.sucursal, ...cambios };
      showToast('¡Guardado! La app ahora se llama ' + (nombre || e.sucursal.app_nombre || 'LicorApp') + ' ✓');
      logoBase64 = null; vistaArchivo = '';
      cargarMarca();
    } else showToast('Error al guardar', 'danger');
  }

  // ---- Carta pública ----
  const urlCarta = $derived(e.sucursal ? new URL('carta.html?s=' + e.sucursal.id, location.href).href : '');
  async function copiarCarta() {
    if (await copiarTexto(urlCarta)) showToast('Enlace copiado ✓');
    else prompt('Copia el enlace de la carta:', urlCarta);
  }
  const abrirCarta = () => window.open(urlCarta, '_blank');
  const compartirCarta = () => abrirWhatsApp(`🍾 *${nombreNegocio()}*\nMira nuestra carta y los precios del día:\n${urlCarta}`);

  // ---- Datos de pago (los ve el cliente en la página del QR) ----
  const pagoVacio = () => ({ pago_movil: { banco: '', telefono: '', cedula: '' }, transferencia: { banco: '', cuenta: '', titular: '', cedula: '' }, zelle: { correo: '', titular: '' } });
  let pago = $state(pagoVacio());
  let estadoPago = $state('');
  const avisoSinSql = () => { estadoPago = 'sql'; };

  async function cargarDatosPago() {
    if (!e.sucursal) return;
    estadoPago = '';
    const r = await rest('sucursales?select=datos_pago&id=eq.' + e.sucursal.id);
    if (r.status === 400) { avisoSinSql(); return; }
    const d = r.ok ? (await r.json())[0]?.datos_pago || {} : {};
    const base = pagoVacio();
    for (const m of Object.keys(base)) for (const k of Object.keys(base[m])) base[m][k] = (d[m] || {})[k] || '';
    pago = base;
  }
  async function guardarPago() {
    if (!e.sucursal) return;
    const datos = {};
    for (const [m, campos] of Object.entries(pago)) {
      datos[m] = {};
      for (const [k, v] of Object.entries(campos)) { const t = String(v).trim(); if (t) datos[m][k] = t; }
    }
    const r = await restPatch('sucursales', e.sucursal.id, { datos_pago: datos });
    if (r.status === 400) { avisoSinSql(); return; }
    if (!r.ok) { showToast('Error al guardar', 'danger'); return; }
    estadoPago = '';
    showToast('Datos de pago guardados ✓');
  }

  // ---- Backup ----
  let backup = $state(null);   // {clase, icono, html}
  async function exportar() {
    if (!e.sucursal) return;
    backup = { clase: 'aviso', icono: 'ti-refresh', texto: 'Generando backup...' };
    try {
      const hace90 = new Date(); hace90.setDate(hace90.getDate() - 90);
      const [menu, todas, caja, tasas] = await Promise.all([
        restGet('menu?select=*&sucursal_id=eq.' + e.sucursal.id + '&order=categoria'),
        restGet('sucursales?select=*'),
        restGet('caja?select=*&sucursal_id=eq.' + e.sucursal.id + '&fecha=gte.' + hace90.toISOString() + '&order=fecha.desc'),
        restGet('tasas_bcv?select=*&sucursal_id=eq.' + e.sucursal.id + '&order=fecha.desc'),
      ]);
      const datos = {
        version: '1.0', fecha: new Date().toISOString(), negocio: e.sucursal.app_nombre || e.sucursal.nombre,
        sucursal: e.sucursal, sucursales: todas, menu, caja_90dias: caja, tasas_bcv: tasas,
        resumen: { total_productos: menu.length, total_ventas_90dias: caja.reduce((s, p) => s + parseFloat(p.total_usd || 0), 0).toFixed(2), total_pedidos_90dias: caja.length },
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
      a.href = url; a.download = `backup_${(e.sucursal.app_nombre || e.sucursal.nombre).replace(/\s+/g, '_')}_${fecha}.json`;
      a.click(); URL.revokeObjectURL(url);
      backup = { clase: 'ok', icono: 'ti-check', texto: `Backup generado: ${menu.length} productos, ${caja.length} ventas (últimos 90 días)` };
    } catch (err) {
      backup = { clase: 'error', icono: 'ti-alert-triangle', texto: 'Error al generar backup' };
    }
  }
  async function importar(ev) {
    const input = ev.currentTarget;
    const file = input.files[0];
    if (!file) return;
    backup = { clase: 'aviso', icono: 'ti-refresh', texto: 'Leyendo archivo...' };
    try {
      const datos = JSON.parse(await file.text());
      if (!datos.version || !datos.menu) { backup = { clase: 'error', icono: 'ti-alert-triangle', texto: 'Archivo inválido: no es un backup de LicorApp' }; return; }
      if (!confirm(`¿Importar backup de "${datos.negocio}" del ${new Date(datos.fecha).toLocaleDateString('es-VE')}?\n\nEsto restaurará ${datos.menu.length} productos del menú.\n\nLos productos actuales NO se borrarán, solo se agregarán los nuevos.`)) return;
      let importados = 0;
      // Importar solo productos que no existan
      const actuales = await restGet('menu?select=nombre&sucursal_id=eq.' + e.sucursal.id);
      const nombres = new Set(actuales.map(m => m.nombre.toLowerCase()));
      for (const prod of datos.menu) {
        if (!nombres.has(prod.nombre.toLowerCase())) {
          await restInsert('menu', {
            sucursal_id: e.sucursal.id, nombre: prod.nombre, tipo: prod.tipo, precio_usd: prod.precio_usd,
            unidades_combo: prod.unidades_combo, unidad: prod.unidad, categoria: prod.categoria, imagen_url: prod.imagen_url || null, activo: true,
          });
          importados++;
        }
      }
      await loadMenu();
      backup = { clase: 'ok', icono: 'ti-check', texto: `Importación completada: ${importados} productos nuevos agregados` };
      input.value = '';
    } catch (err) {
      backup = { clase: 'error', icono: 'ti-alert-triangle', texto: 'Error al importar: archivo corrupto o inválido' };
    }
  }
  let inputImportar = $state();

  // Los datos de la marca y de pago se recargan solo al cambiar de sucursal
  const sucId = $derived(e.sucursal?.id);
  $effect(() => { untrack(cargar); });
  $effect(() => { sucId; untrack(() => { cargarMarca(); cargarDatosPago(); }); });
</script>

<div id="amt-sucursales">
  <div class="top-bar"><h2>Sucursales</h2><button class="btn sm primary" onclick={() => (formAbierto = !formAbierto)}><i class="ti ti-plus"></i> Nueva</button></div>
  {#if formAbierto}
    <div id="suc-form" class="af">
      <div class="fg"><label for="suc-nombre">Nombre</label><input id="suc-nombre" placeholder="Ej: Licorería Centro" bind:value={nueva.nombre} /></div>
      <div class="row2">
        <div class="fg"><label for="suc-ciudad">Ciudad</label><input id="suc-ciudad" placeholder="Caracas" bind:value={nueva.ciudad} /></div>
        <div class="fg"><label for="suc-dir">Dirección</label><input id="suc-dir" placeholder="Av. Principal..." bind:value={nueva.dir} /></div>
      </div>
      <div class="fa">
        <button class="btn sm ghost" onclick={() => (formAbierto = false)}>Cancelar</button>
        <button class="btn sm primary" onclick={guardar}><i class="ti ti-check"></i> Guardar</button>
      </div>
    </div>
  {/if}
  <div id="sucursales-list">
    {#if !sucursales.length}<Vacio icono="ti-building-store">Sin sucursales.</Vacio>
    {:else}
      {#each sucursales as s (s.id)}
        {@const activa = s.id === e.sucursal?.id}
        <div class="suc-card" class:active-branch={activa}>
          <div class="fila crece"><i class="ti ti-building-store t-acento" style="font-size:22px"></i>
            <div class="crece"><div class="t-fuerte recorta">{s.nombre}</div>
              <div class="t-sub recorta">{s.ciudad || ''} {s.direccion ? '· ' + s.direccion : ''}</div></div>
          </div>
          {#if activa}<span class="pill cobrado">Activa</span>
          {:else}<button class="btn sm" onclick={() => cambiar(s)}>Ir <i class="ti ti-arrow-right"></i></button>{/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="card mt-m" id="suc-branding-card">
    <div class="ch"><i class="ti ti-palette"></i> Nombre y logo de la app</div>
    <div class="fg mt-s">
      <label for="brand-nombre">Nombre de la app</label>
      <input id="brand-nombre" placeholder="Ej: La Bodeguita, El Rincón..." bind:value={marca.nombre} />
    </div>
    <div class="fg">
      <label for="brand-url">URL del logo (imagen de internet)</label>
      <input id="brand-url" placeholder="https://..." bind:value={marca.url} oninput={alEscribirUrl} />
    </div>
    <div class="fg">
      <label for="brand-file">O sube una imagen desde tu dispositivo</label>
      <input type="file" id="brand-file" accept="image/*" onchange={elegirArchivo} />
    </div>
    {#if imagenVista || marca.nombre.trim()}
      <div id="brand-preview" class="brand-preview" style="display:flex">
        {#if imagenVista}<img id="brand-preview-img" src={imagenVista} alt="Vista previa del logo" />{/if}
        <div id="brand-preview-nombre">{marca.nombre.trim()}</div>
      </div>
    {/if}
    <button class="btn primary full" onclick={guardarMarca}><i class="ti ti-check"></i> Guardar nombre y logo</button>
  </div>

  <div class="card">
    <div class="ch"><i class="ti ti-book"></i> Carta pública</div>
    <p class="t-sub mb-m">Tus clientes ven los productos y precios del día sin iniciar sesión. Imprime el QR para las mesas o comparte el enlace.</p>
    <div id="carta-qr" class="qr-caja">{#if urlCarta}<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data={encodeURIComponent(urlCarta)}" alt="QR de la carta" />{/if}</div>
    <div id="carta-url" class="qr-url">{urlCarta}</div>
    <div class="grupo-btn">
      <button class="btn sm" onclick={copiarCarta}><i class="ti ti-copy"></i> Copiar</button>
      <button class="btn sm" onclick={abrirCarta}><i class="ti ti-external-link"></i> Ver</button>
      <button class="btn sm success" onclick={compartirCarta}><i class="ti ti-brand-whatsapp"></i> Enviar</button>
    </div>
  </div>

  <div class="card">
    <div class="ch"><i class="ti ti-wallet"></i> Datos de pago para clientes</div>
    <p class="t-sub mb-m">Aparecen en la página del pedido con botón de copiar y el monto exacto. Deja en blanco lo que no uses.</p>
    <div class="slabel" style="margin-top:4px"><i class="ti ti-device-mobile"></i> Pago móvil</div>
    <div class="row2">
      <div class="fg"><label for="dp-pm-banco">Banco</label><input id="dp-pm-banco" placeholder="Banesco (0134)" bind:value={pago.pago_movil.banco} /></div>
      <div class="fg"><label for="dp-pm-tel">Teléfono</label><input id="dp-pm-tel" type="tel" placeholder="0414-0000000" bind:value={pago.pago_movil.telefono} /></div>
    </div>
    <div class="fg"><label for="dp-pm-ced">Cédula / RIF</label><input id="dp-pm-ced" placeholder="V-12345678" bind:value={pago.pago_movil.cedula} /></div>
    <div class="slabel"><i class="ti ti-arrows-exchange"></i> Transferencia</div>
    <div class="row2">
      <div class="fg"><label for="dp-tr-banco">Banco</label><input id="dp-tr-banco" placeholder="Mercantil" bind:value={pago.transferencia.banco} /></div>
      <div class="fg"><label for="dp-tr-ced">Cédula / RIF</label><input id="dp-tr-ced" placeholder="J-12345678-9" bind:value={pago.transferencia.cedula} /></div>
    </div>
    <div class="fg"><label for="dp-tr-cuenta">Número de cuenta</label><input id="dp-tr-cuenta" inputmode="numeric" placeholder="0105 0000 00 0000000000" bind:value={pago.transferencia.cuenta} /></div>
    <div class="fg"><label for="dp-tr-titular">Titular</label><input id="dp-tr-titular" placeholder="Nombre del titular" bind:value={pago.transferencia.titular} /></div>
    <div class="slabel"><i class="ti ti-building-bank"></i> Zelle</div>
    <div class="row2">
      <div class="fg"><label for="dp-ze-correo">Correo</label><input id="dp-ze-correo" type="email" placeholder="pagos@correo.com" bind:value={pago.zelle.correo} /></div>
      <div class="fg"><label for="dp-ze-titular">Titular</label><input id="dp-ze-titular" placeholder="Nombre del titular" bind:value={pago.zelle.titular} /></div>
    </div>
    <button class="btn primary full" onclick={guardarPago}><i class="ti ti-check"></i> Guardar datos de pago</button>
    {#if estadoPago === 'sql'}
      <div id="datos-pago-status" class="banner mt-m aviso" style="display:flex"><i class="ti ti-database"></i> Falta un paso: ejecuta <strong>supabase/cliente.sql</strong> en Supabase para guardar los datos de pago.</div>
    {/if}
  </div>

  <div class="card">
    <div class="ch"><i class="ti ti-database-export"></i> Backup de datos</div>
    <p class="t-sub mb-m">Exporta toda la configuración e historial de tu negocio en un archivo JSON.</p>
    <div class="grupo-btn">
      <button class="btn primary" onclick={exportar}><i class="ti ti-download"></i> Exportar</button>
      <button class="btn" onclick={() => inputImportar.click()}><i class="ti ti-upload"></i> Importar</button>
    </div>
    <input type="file" id="import-file" accept=".json" style="display:none" bind:this={inputImportar} onchange={importar} />
    {#if backup}<div id="backup-status" class="banner mt-m {backup.clase}" style="display:flex"><i class="ti {backup.icono}"></i> {backup.texto}</div>{/if}
  </div>
</div>
