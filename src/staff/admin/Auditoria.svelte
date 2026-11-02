<script>
  // Lo que el dueño debe revisar: productos quitados o bajados después de
  // servidos (tabla pedido_ajustes) y pedidos cancelados sin cobrar.
  import { e } from '../../lib/estado.svelte.js';
  import { restGet } from '../../lib/api.js';
  import { fmtUSD, fechaCorta } from '../../lib/formato.svelte.js';
  import { plural } from '../../lib/catalogo.js';
  import Metrica from '../../ui/Metrica.svelte';
  import Vacio from '../../ui/Vacio.svelte';
  import { desde } from '../periodos.js';

  let periodo = $state('hoy');
  let ajustes = $state([]), cancelados = $state([]), perfiles = $state([]);
  let cargando = $state(true);

  async function cargar() {
    if (!e.sucursal) return;
    cargando = true;
    const suc = 'sucursal_id=eq.' + e.sucursal.id, d = desde(periodo);
    const [a, c, p] = await Promise.all([
      restGet('pedido_ajustes?select=*&' + suc + '&created_at=gte.' + d + '&order=created_at.desc'),
      restGet('pedidos?select=id,cliente_nombre,nota,created_at,usuario_id&' + suc + '&estado=eq.cancelado&created_at=gte.' + d + '&order=created_at.desc'),
      restGet('perfiles?select=id,nombre'),
    ]);
    ajustes = a || []; cancelados = c || []; perfiles = p || []; cargando = false;
  }
  $effect(() => { periodo; cargar(); });

  const quien = id => perfiles.find(p => p.id === id)?.nombre || 'Alguien';
  const montoAjustes = $derived(ajustes.reduce((s, a) => s + parseFloat(a.monto_usd || 0), 0));
</script>

<div id="amt-auditoria">
  <div class="top-bar"><h2>Auditoría</h2></div>
  <div class="itabs">
    {#each [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']] as [id, texto] (id)}
      <button class="itab" class:active={periodo === id} id="aud-{id.substring(0, 3)}" onclick={() => (periodo = id)}>{texto}</button>
    {/each}
  </div>
  {#if cargando}<div class="spinner centro"></div>
  {:else}
    <div class="g2 dos">
      <Metrica label="Quitado tras servir" valor={fmtUSD(montoAjustes)} destacada={montoAjustes > 0} />
      <Metrica label="Cancelados" valor={cancelados.length} />
    </div>

    <div class="card" id="aud-ajustes">
      <div class="ch"><i class="ti ti-arrow-back-up"></i> Quitado o bajado después de servido</div>
      {#if !ajustes.length}<Vacio icono="ti-circle-check">Nada en este período.</Vacio>
      {:else}
        {#each ajustes as a (a.id)}
          <div class="res-row">
            <div class="crece">
              <div class="t-fuerte recorta">{a.nombre}</div>
              <div class="t-mini">{quien(a.usuario_id)} · {fechaCorta(a.created_at)} · servido {a.servido_antes} → {a.servido_despues}</div>
            </div>
            <div class="t-fuerte">{fmtUSD(a.monto_usd)}</div>
          </div>
        {/each}
      {/if}
    </div>

    <div class="card" id="aud-cancelados">
      <div class="ch"><i class="ti ti-x"></i> Pedidos cancelados sin cobrar</div>
      {#if !cancelados.length}<Vacio icono="ti-circle-check">Nada en este período.</Vacio>
      {:else}
        {#each cancelados as p (p.id)}
          <div class="res-row">
            <div class="crece">
              <div class="t-fuerte recorta">{p.cliente_nombre}</div>
              <div class="t-mini">{p.nota || 'Abierto por ' + quien(p.usuario_id) + ' · ' + fechaCorta(p.created_at)}</div>
            </div>
          </div>
        {/each}
      {/if}
      <p class="t-mini mt-s">{cancelados.length} {plural(cancelados.length, 'pedido')} en el período. La nota dice quién lo canceló y cuánto se dejó de cobrar.</p>
    </div>
  {/if}
</div>
