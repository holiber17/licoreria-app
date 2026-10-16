<script>
  import { LOGO_URL } from '../lib/config.js';
  import { e, nombreNegocio } from '../lib/estado.svelte.js';
  import { ped } from './pedido.svelte.js';
  import { fmtUSD, fmtBsCon, totalDe } from '../lib/formato.svelte.js';
  import { fmtHora } from '../lib/catalogo.js';
  import { descargarPDF, abrirWhatsApp } from './comprobantes.js';
  import Hoja from '../ui/Hoja.svelte';

  let { abierto, alCerrar } = $props();
  let contenedor = $state();
  const items = $derived(ped.actual?.pedido_items || []);
  const total = $derived(totalDe(items));
  const fecha = $derived(abierto ? new Date().toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

  function whatsapp() {
    const t = e.tasaBCV;
    const f = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' · ' + fmtHora(new Date());
    let texto = `🍾 *${nombreNegocio()}*\n📋 Cuenta de: *${ped.actual?.cliente_nombre || 'cliente'}*\n📅 ${f}\n\n`;
    items.filter(i => i.consumido > 0).forEach(i => { texto += `• ${i.nombre} × ${i.consumido}: ${fmtUSD(i.consumido * i.precio_usd)}\n`; });
    texto += `\n💰 *TOTAL: ${fmtUSD(total)}*\n🇻🇪 Bs ${Math.round(total * t).toLocaleString('es-VE')}\n📊 Tasa BCV: ${t.toFixed(2)} Bs/$`;
    abrirWhatsApp(texto);
  }
</script>

<Hoja id="pdf-modal-cuenta" {abierto} {alCerrar} titulo="Vista previa">
  <div id="pdf-content-cuenta" class="pdf-preview" bind:this={contenedor}>
    <div class="pdf-header">
      <img class="pdf-logo" src={LOGO_URL} alt="" />
      <div class="pdf-title">{nombreNegocio()}</div>
      <div class="pdf-sub">Cuenta del pedido · {fecha}</div>
      <div class="pdf-sub fuerte">Cliente: {ped.actual?.cliente_nombre || ''}</div>
    </div>
    {#each items as i (i.id)}
      <div class="pdf-row">
        <span>{i.nombre} × {i.consumido} {i.unidad}{i.consumido !== 1 ? 's' : ''}</span>
        <div class="der"><div>{fmtUSD(i.consumido * i.precio_usd)}</div><div class="bs">{fmtBsCon(i.consumido * i.precio_usd, e.tasaBCV)}</div></div>
      </div>
    {/each}
    <div class="pdf-total">
      <span>TOTAL</span>
      <div class="der"><div>{fmtUSD(total)}</div><div class="bs">{fmtBsCon(total, e.tasaBCV)}</div></div>
    </div>
    <div class="pdf-footer">Método de pago: {ped.metodo || 'por definir'} · Tasa BCV: {e.tasaBCV.toFixed(2)} Bs/$<br />Gracias por su preferencia</div>
  </div>
  <div class="grupo-btn">
    <button class="btn primary" onclick={() => descargarPDF(contenedor, 'Cuenta_' + (ped.actual?.cliente_nombre || 'cliente'))}><i class="ti ti-download"></i> Descargar PDF</button>
    <button class="btn success" onclick={whatsapp}><i class="ti ti-brand-whatsapp"></i> WhatsApp</button>
  </div>
</Hoja>
