<script>
  import { LOGO_URL, sb } from '../lib/config.js';
  import { e, nombreNegocio } from '../lib/estado.svelte.js';
  import { fmtUSD, fmtBsCon, fmtBsTotal, resumenCaja, agruparItems } from '../lib/formato.svelte.js';
  import { fmtHora } from '../lib/catalogo.js';
  import { descargarPDF, abrirWhatsApp } from './comprobantes.js';
  import Reporte from '../ui/Reporte.svelte';
  import Monto from '../ui/Monto.svelte';
  import Ranking from '../ui/Ranking.svelte';
  import Nota from '../ui/Nota.svelte';
  import Hoja from '../ui/Hoja.svelte';
  import Turno from './Turno.svelte';
  import { hoyCaracas, inicioDia } from '../lib/fechas.js';

  const activa = $derived(e.seccion === 'caja');
  let tab = $state('historial');
  let registros = $state([]);
  let itemsVendidos = $state([]);
  let pdf = $state(null);        // {caja, r, fecha} del cierre en vista previa
  let contenedor = $state();

  const r = $derived(resumenCaja(registros));
  const ranking = $derived(agruparItems(itemsVendidos).sort((a, b) => b.total - a.total));

  // Con turno abierto la caja muestra lo cobrado en el turno (aunque pase de
  // medianoche); sin turno, lo cobrado desde las 12 a.m. de hoy en Caracas.
  let turno = $state(null);
  let cerrados = $state([]);
  const desdeHoy = () => inicioDia(hoyCaracas());

  async function cargar() {
    if (!e.sucursal) return;
    const [{ data: t }, { data: ult }] = await Promise.all([
      sb.from('turnos').select('*').eq('sucursal_id', e.sucursal.id).is('cerrado_at', null).maybeSingle(),
      sb.from('turnos').select('*').eq('sucursal_id', e.sucursal.id).not('cerrado_at', 'is', null).order('cerrado_at', { ascending: false }).limit(10),
    ]);
    turno = t || null; cerrados = ult || [];
    let q = sb.from('caja').select('*').eq('sucursal_id', e.sucursal.id);
    q = turno ? q.eq('turno_id', turno.id) : q.gte('fecha', desdeHoy());
    const { data: caja } = await q.order('fecha', { ascending: false });
    registros = caja || [];
    const ids = registros.map(x => x.pedido_id).filter(Boolean);
    itemsVendidos = ids.length ? (await sb.from('pedido_items').select('*').in('pedido_id', ids)).data || [] : [];
  }
  $effect(() => { if (activa) cargar(); });

  async function generarPDF() {
    const caja = [...registros].reverse();
    const fecha = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) + ' · ' + fmtHora(new Date());
    pdf = { caja, r: resumenCaja(caja), fecha };
  }
  function whatsapp() {
    const texto = `🍾 *${nombreNegocio()}*\n📊 Cierre de caja - ${new Date().toLocaleDateString('es-VE')} · ${fmtHora(new Date())}\n\nSe generó el reporte del día.\n📊 Tasa BCV: ${e.tasaBCV.toFixed(2)} Bs/$`;
    abrirWhatsApp(texto);
  }
</script>

<section id="sec-caja" class="sec" class:active={activa}>
  <div class="top-bar"><h2>{turno ? 'Caja del turno' : 'Caja del día'}</h2>
    <div class="acciones">
      <button class="btn sm" onclick={generarPDF}><i class="ti ti-file-text"></i> PDF</button>
    </div>
  </div>
  <Turno {turno} {registros} alCambiar={cargar} />
  <div class="g2" id="caja-metrics"><Reporte {r} pedidos="Pedidos cobrados" /></div>
  <div class="itabs">
    <button class="itab" class:active={tab === 'historial'} id="ctab-historial" onclick={() => (tab = 'historial')}><i class="ti ti-history"></i> Historial</button>
    <button class="itab" class:active={tab === 'productos'} id="ctab-productos" onclick={() => (tab = 'productos')}><i class="ti ti-bottle"></i> Por producto</button>
    <button class="itab" class:active={tab === 'turnos'} id="ctab-turnos" onclick={() => (tab = 'turnos')}><i class="ti ti-lock"></i> Turnos</button>
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
  {:else if tab === 'turnos'}
    <div id="cmt-turnos">
      {#if !cerrados.length}<div class="empty"><i class="ti ti-lock"></i>Todavía no hay turnos cerrados.</div>
      {:else}
        {#each cerrados as t (t.id)}
          {@const d = parseFloat(t.diferencia_usd || 0)}
          {@const ventas = Object.values(t.esperado || {}).reduce((s, v) => s + parseFloat(v.usd || 0), 0)}
          <div class="hcard">
            <div class="fila arriba entre">
              <div class="crece">
                <div class="t-fuerte">{new Date(t.abierto_at).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} → {fmtHora(new Date(t.cerrado_at))}</div>
                <div class="t-sub">Ventas {fmtUSD(ventas)}{t.nota ? ' · ' + t.nota : ''}</div>
              </div>
              <div class="t-fuerte" class:t-ok={Math.abs(d) < 0.01} class:t-error={d <= -0.01}>{Math.abs(d) < 0.01 ? 'Cuadra' : (d < 0 ? '−' : '+') + fmtUSD(Math.abs(d))}</div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <div id="cmt-productos"><div class="card"><div id="caja-productos">
      {#if !registros.length}<Nota>Sin ventas registradas.</Nota>
      {:else if !itemsVendidos.length}<Nota>Sin detalle disponible.</Nota>
      {:else}{#each ranking as x, idx (x.nombre)}<Ranking {idx} r={x} />{/each}{/if}
    </div></div></div>
  {/if}

  <Hoja id="pdf-modal-caja" abierto={!!pdf} alCerrar={() => (pdf = null)} titulo={turno ? "Reporte del turno" : "Reporte del día"}>
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
          <span>{turno ? "TOTAL DEL TURNO" : "TOTAL DEL DÍA"}</span>
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
