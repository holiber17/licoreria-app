<script>
  // Turno de caja: se abre con el fondo y se cierra contando lo que hay por
  // método de pago. La base calcula lo esperado y guarda la diferencia
  // (funciones abrir_turno y cerrar_turno, supabase/turnos.sql).
  import { sb } from '../lib/supabase.js';
  import { e, nombreNegocio } from '../lib/estado.svelte.js';
  import { fmtUSD } from '../lib/formato.svelte.js';
  import { bs } from '../lib/dinero.js';
  import { msgError, fmtHora } from '../lib/catalogo.js';
  import { showToast, enCurso, ocupado } from '../lib/avisos.svelte.js';
  import { abrirWhatsApp } from './comprobantes.js';
  import Hoja from '../ui/Hoja.svelte';

  let { turno, registros = [], alCambiar } = $props();

  let abriendo = $state(false), cerrando = $state(false);
  let fondo = $state({ usd: '', bs: '' });
  let contado = $state({ efectivo_usd: '', efectivo_bs: '', zelle_usd: '', pago_movil_bs: '', transferencia_bs: '' });
  let nota = $state('');
  let cerrado = $state(null);   // turno recién cerrado, para mostrar el resultado

  const num = v => Math.max(0, parseFloat(String(v).replace(',', '.')) || 0);
  const tasa = $derived(e.tasaBCV || 0);

  // Lo esperado por método, con lo cobrado en este turno (vista previa; la base recalcula al cerrar)
  const esperado = $derived.by(() => {
    const m = {};
    registros.forEach(c => {
      const k = c.metodo_pago || 'Efectivo';
      (m[k] ||= { usd: 0, bs: 0, pedidos: 0 });
      m[k].usd += parseFloat(c.total_usd || 0);
      m[k].bs += parseFloat(c.total_usd || 0) * parseFloat(c.tasa_bcv || 0);
      m[k].pedidos++;
    });
    return m;
  });
  const efectivoEsperado = $derived((esperado.Efectivo?.usd || 0) + num(turno?.fondo_usd) + (tasa ? num(turno?.fondo_bs) / tasa : 0));

  function abrirHojaCierre() {
    contado = { efectivo_usd: '', efectivo_bs: '', zelle_usd: '', pago_movil_bs: '', transferencia_bs: '' };
    nota = ''; cerrado = null; cerrando = true;
  }

  async function abrirTurno() {
    await enCurso('turno', async () => {
      const { error } = await sb.rpc('abrir_turno', { p_sucursal: e.sucursal.id, p_fondo_usd: num(fondo.usd), p_fondo_bs: num(fondo.bs) });
      if (error) { showToast(msgError(error, 'No se pudo abrir el turno'), 'danger'); return; }
      abriendo = false; fondo = { usd: '', bs: '' };
      showToast('Turno abierto ✓');
      alCambiar?.();
    });
  }

  async function cerrarTurno() {
    const c = Object.fromEntries(Object.entries(contado).map(([k, v]) => [k, num(v)]));
    await enCurso('turno', async () => {
      const { data, error } = await sb.rpc('cerrar_turno', { p_turno: turno.id, p_contado: c, p_nota: nota.trim() || null });
      if (error) { showToast(msgError(error, 'No se pudo cerrar el turno'), 'danger'); return; }
      cerrado = data;
      alCambiar?.();
    });
  }

  const textoDiferencia = d => (Math.abs(d) < 0.01 ? 'Cuadra exacto' : d < 0 ? 'Faltan ' + fmtUSD(-d) : 'Sobran ' + fmtUSD(d));

  function compartirCierre() {
    const t = cerrado; if (!t) return;
    const lineas = Object.entries(t.esperado || {}).map(([m, v]) => `• ${m}: ${fmtUSD(v.usd)} (${v.pedidos})`).join('\n');
    abrirWhatsApp(`🍾 *${nombreNegocio()}*\n🧾 Cierre de turno · ${new Date(t.abierto_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })} → ${fmtHora(new Date(t.cerrado_at))}\n\n${lineas || 'Sin ventas'}\n\n*${textoDiferencia(parseFloat(t.diferencia_usd))}*${t.nota ? '\n📝 ' + t.nota : ''}`);
  }
</script>

<div class="card" id="turno-card">
  {#if turno}
    <div class="fila entre">
      <div class="crece">
        <div class="t-fuerte"><i class="ti ti-clock-play t-ok"></i> Turno abierto desde las {fmtHora(new Date(turno.abierto_at))}</div>
        <div class="t-mini">Fondo: {fmtUSD(turno.fondo_usd)}{num(turno.fondo_bs) ? ' + Bs ' + bs(turno.fondo_bs) : ''}</div>
      </div>
      <button class="btn sm primary" id="btn-cerrar-turno" onclick={abrirHojaCierre}><i class="ti ti-lock"></i> Cerrar turno</button>
    </div>
  {:else}
    <div class="fila entre">
      <div class="crece">
        <div class="t-fuerte">Sin turno abierto</div>
        <div class="t-mini">Se muestran las ventas desde las 12 a.m. (hora de Caracas)</div>
      </div>
      <button class="btn sm primary" id="btn-abrir-turno" onclick={() => (abriendo = true)}><i class="ti ti-player-play"></i> Abrir turno</button>
    </div>
  {/if}
</div>

<Hoja id="hoja-abrir-turno" abierto={abriendo} alCerrar={() => (abriendo = false)} titulo="Abrir turno">
  <p class="t-sub mb-m">¿Con cuánto efectivo empieza la caja? (el fondo para dar vuelto)</p>
  <div class="g2 dos">
    <div class="fg"><label for="fondo-usd">Fondo en $</label><input id="fondo-usd" inputmode="decimal" placeholder="0" bind:value={fondo.usd} /></div>
    <div class="fg"><label for="fondo-bs">Fondo en Bs</label><input id="fondo-bs" inputmode="decimal" placeholder="0" bind:value={fondo.bs} /></div>
  </div>
  <button class="btn primary full grande" id="btn-confirmar-abrir" disabled={ocupado.turno} onclick={abrirTurno}><i class="ti ti-check"></i> Abrir turno</button>
</Hoja>

<Hoja id="hoja-cerrar-turno" abierto={cerrando} alCerrar={() => (cerrando = false)} titulo={cerrado ? 'Turno cerrado' : 'Cerrar turno'}>
  {#if cerrado}
    {@const d = parseFloat(cerrado.diferencia_usd)}
    <div class="banner {Math.abs(d) < 0.01 ? 'ok' : d < 0 ? 'error' : 'aviso'}" style="display:flex" id="turno-resultado" role="status">
      <i class="ti {Math.abs(d) < 0.01 ? 'ti-circle-check' : 'ti-alert-triangle'}"></i> {textoDiferencia(d)}
    </div>
    {#each Object.entries(cerrado.esperado || {}) as [m, v] (m)}
      <div class="res-row"><span>{m} · {v.pedidos} {v.pedidos === 1 ? 'cobro' : 'cobros'}</span><span class="t-fuerte">{fmtUSD(v.usd)}</span></div>
    {/each}
    <div class="grupo-btn mt-m">
      <button class="btn success" onclick={compartirCierre}><i class="ti ti-brand-whatsapp"></i> Enviar resumen</button>
      <button class="btn" onclick={() => (cerrando = false)}>Listo</button>
    </div>
  {:else if turno}
    <p class="t-sub mb-m">Cuenta lo que hay y escríbelo. La diferencia se calcula sola.</p>
    <div class="cierre-metodo">
      <div class="t-fuerte">Efectivo <span class="t-mini">· esperado {fmtUSD(efectivoEsperado)} (incluye el fondo)</span></div>
      <div class="g2 dos">
        <div class="fg"><label for="c-ef-usd">Contado en $</label><input id="c-ef-usd" inputmode="decimal" placeholder="0" bind:value={contado.efectivo_usd} /></div>
        <div class="fg"><label for="c-ef-bs">Contado en Bs</label><input id="c-ef-bs" inputmode="decimal" placeholder="0" bind:value={contado.efectivo_bs} /></div>
      </div>
    </div>
    <div class="fg"><label for="c-zelle">Zelle recibido en $ <span class="t-mini">· esperado {fmtUSD(esperado.Zelle?.usd || 0)}</span></label><input id="c-zelle" inputmode="decimal" placeholder="0" bind:value={contado.zelle_usd} /></div>
    <div class="fg"><label for="c-pm">Pago móvil recibido en Bs <span class="t-mini">· esperado Bs {bs(esperado['Pago móvil']?.bs || 0)}</span></label><input id="c-pm" inputmode="decimal" placeholder="0" bind:value={contado.pago_movil_bs} /></div>
    <div class="fg"><label for="c-tr">Transferencias recibidas en Bs <span class="t-mini">· esperado Bs {bs(esperado.Transferencia?.bs || 0)}</span></label><input id="c-tr" inputmode="decimal" placeholder="0" bind:value={contado.transferencia_bs} /></div>
    <div class="fg"><label for="c-nota">Nota (opcional)</label><input id="c-nota" maxlength="200" placeholder="Ej: faltó vuelto de una mesa" bind:value={nota} /></div>
    <button class="btn primary full grande" id="btn-confirmar-cierre" disabled={ocupado.turno} onclick={cerrarTurno}><i class="ti ti-lock"></i> Cerrar turno</button>
  {/if}
</Hoja>
