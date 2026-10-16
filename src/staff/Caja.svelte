<script>
  import { LOGO_URL, sb } from '../lib/config.js';
  import { e, nombreNegocio } from '../lib/estado.svelte.js';
  import { restGet } from '../lib/api.js';
  import { fmtUSD, fmtBsCon, fmtBsTotal, resumenCaja, agruparItems } from '../lib/formato.svelte.js';
  import { fmtHora } from '../lib/catalogo.js';
  import { showToast } from '../lib/avisos.svelte.js';
  import { descargarPDF, abrirWhatsApp } from './comprobantes.js';
  import Reporte from '../ui/Reporte.svelte';
  import Monto from '../ui/Monto.svelte';
  import Ranking from '../ui/Ranking.svelte';
  import Nota from '../ui/Nota.svelte';
  import Hoja from '../ui/Hoja.svelte';

  const activa = $derived(e.seccion === 'caja');
  let tab = $state('historial');
  let registros = $state([]);
  let itemsVendidos = $state([]);
  let pdf = $state(null);        // {caja, r, fecha} del cierre en vista previa
  let contenedor = $state();

  const r = $derived(resumenCaja(registros));
  const ranking = $derived(agruparItems(itemsVendidos).sort((a, b) => b.total - a.total));

  async function cargar() {
    if (!e.sucursal) return;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const { data: caja } = await sb.from('caja').select('*').eq('sucursal_id', e.sucursal.id).gte('fecha', hoy.toISOString()).order('fecha', { ascending: false });
    registros = caja || [];
    const ids = registros.map(x => x.pedido_id).filter(Boolean);
    itemsVendidos = ids.length ? (await sb.from('pedido_items').select('*').in('pedido_id', ids)).data || [] : [];
  }
  $effect(() => { if (activa) cargar(); });

  function nuevaJornada() {
    if (!confirm('¿Iniciar nueva jornada?')) return;
    showToast('Nueva jornada iniciada'); cargar();
  }

  async function generarPDF() {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const caja = await restGet('caja?select=*&sucursal_id=eq.' + e.sucursal.id + '&fecha=gte.' + hoy.toISOString() + '&order=fecha.asc');
    const fecha = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) + ' · ' + fmtHora(new Date());
    pdf = { caja, r: resumenCaja(caja), fecha };
  }
  function whatsapp() {
    const texto = `🍾 *${nombreNegocio()}*\n📊 Cierre de caja - ${new Date().toLocaleDateString('es-VE')} · ${fmtHora(new Date())}\n\nSe generó el reporte del día.\n📊 Tasa BCV: ${e.tasaBCV.toFixed(2)} Bs/$`;
    abrirWhatsApp(texto);
  }
</script>

<section id="sec-caja" class="sec" class:active={activa}>
  <div class="top-bar"><h2>Caja del día</h2>
    <div class="acciones">
      <button class="btn sm" onclick={generarPDF}><i class="ti ti-file-text"></i> PDF</button>
      <button class="btn sm danger" onclick={nuevaJornada}><i class="ti ti-refresh"></i> Nueva jornada</button>
    </div>
  </div>
  <div class="g2" id="caja-metrics"><Reporte {r} pedidos="Pedidos cobrados" /></div>
  <div class="itabs">
    <button class="itab" class:active={tab === 'historial'} id="ctab-historial" onclick={() => (tab = 'historial')}><i class="ti ti-history"></i> Historial</button>
    <button class="itab" class:active={tab === 'productos'} id="ctab-productos" onclick={() => (tab = 'productos')}><i class="ti ti-bottle"></i> Por producto</button>
  </div>
  {#if tab === 'historial'}
    <div id="cmt-historial"><div id="caja-historial">
      {#if !registros.length}
        <div class="empty"><i class="ti ti-receipt"></i>Sin pedidos cobrados hoy.</div>
      {:else}
        {#each registros as p (p.id)}
          {@const t = parseFloat(p.tasa_bcv || e.tasaBCV)}
          <div class="hcard">
            <div class="fila arriba entre">
              <div class="crece"><div class="t-fuerte">{p.cliente_nombre}</div>
                <div class="t-sub">{new Date(p.fecha).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · BCV {t.toFixed(2)} · {p.metodo_pago || 'Efectivo'}{p.nota ? ' · ' + p.nota : ''}</div></div>
              <Monto usd={p.total_usd} {t} />
            </div>
          </div>
        {/each}
      {/if}
    </div></div>
  {:else}
    <div id="cmt-productos"><div class="card"><div id="caja-productos">
      {#if !registros.length}<Nota>Sin ventas registradas.</Nota>
      {:else if !itemsVendidos.length}<Nota>Sin detalle disponible.</Nota>
      {:else}{#each ranking as x, idx (x.nombre)}<Ranking {idx} r={x} />{/each}{/if}
    </div></div></div>
  {/if}

  <Hoja id="pdf-modal-caja" abierto={!!pdf} alCerrar={() => (pdf = null)} titulo="Reporte del día">
    {#if pdf}
      <div id="pdf-content-caja" class="pdf-preview" bind:this={contenedor}>
        <div class="pdf-header">
          <img class="pdf-logo" src={LOGO_URL} alt="" />
          <div class="pdf-title">{nombreNegocio()}</div>
          <div class="pdf-sub">Cierre de caja · {pdf.fecha}</div>
          <div class="pdf-sub">Tasa BCV: {e.tasaBCV.toFixed(2)} Bs/$</div>
        </div>
        <div class="pdf-row"><span class="t-fuerte">Total pedidos cobrados</span><span class="t-fuerte">{pdf.r.num}</span></div>
        <div class="pdf-row"><span class="t-fuerte">Ticket promedio</span><span>{fmtUSD(pdf.r.ticket)}</span></div>
        <div class="pdf-seccion">Detalle de pedidos</div>
        {#each pdf.caja as p (p.id)}
          <div class="pdf-row">
            <div>
              <div class="t-fuerte">{p.cliente_nombre}</div>
              <div class="det">{new Date(p.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })} · {p.metodo_pago || 'Efectivo'}{p.nota ? ' · ' + p.nota : ''}</div>
            </div>
            <div class="der"><div>{fmtUSD(p.total_usd)}</div><div class="bs">{fmtBsCon(p.total_usd, p.tasa_bcv || e.tasaBCV)}</div></div>
          </div>
        {/each}
        <div class="pdf-total">
          <span>TOTAL DEL DÍA</span>
          <div class="der"><div>{fmtUSD(pdf.r.totalUSD)}</div><div class="bs">{fmtBsTotal(pdf.r.totalBs)}</div></div>
        </div>
        <div class="pdf-footer">Generado el {new Date().toLocaleString('es-VE')} · {nombreNegocio()}</div>
      </div>
      <div class="grupo-btn">
        <button class="btn primary" onclick={() => descargarPDF(contenedor, 'Cierre_Caja')}><i class="ti ti-download"></i> Descargar PDF</button>
        <button class="btn success" onclick={whatsapp}><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>
      </div>
    {/if}
  </Hoja>
</section>
