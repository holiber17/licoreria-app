<script>
  import { e } from '../../lib/estado.svelte.js';
  import { restGet } from '../../lib/api.js';
  import { fmtUSD, fmtBsTotal, resumenCaja } from '../../lib/formato.svelte.js';
  import { ini, plural } from '../../lib/catalogo.js';
  import Metrica from '../../ui/Metrica.svelte';
  import Vacio from '../../ui/Vacio.svelte';
  import { desde } from '../periodos.js';

  let periodo = $state('hoy');
  let perfiles = $state([]), caja = $state([]);
  let cargando = $state(true);

  async function cargar() {
    if (!e.sucursal) return;
    cargando = true;
    const [p, c] = await Promise.all([
      restGet('perfiles?select=id,nombre,rol&sucursal_id=eq.' + e.sucursal.id),
      restGet('caja?select=*&sucursal_id=eq.' + e.sucursal.id + '&fecha=gte.' + desde(periodo)),
    ]);
    perfiles = p; caja = c; cargando = false;
  }
  $effect(() => { periodo; cargar(); });
</script>

<div id="amt-empleados">
  <div class="top-bar"><h2>Por empleado</h2></div>
  <div class="itabs">
    {#each [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']] as [id, texto] (id)}
      <button class="itab" class:active={periodo === id} id="emp-{id.substring(0, 3)}" onclick={() => (periodo = id)}>{texto}</button>
    {/each}
  </div>
  <div id="emp-list">
    {#if cargando}<div class="spinner centro"></div>
    {:else if !perfiles.length}<Vacio icono="ti-users">Sin empleados registrados.</Vacio>
    {:else}
      {#each perfiles as p (p.id)}
        {@const r = resumenCaja(caja.filter(c => c.usuario_id === p.id))}
        {@const dueno = p.rol === 'dueno'}
        <div class="card">
          <div class="fila mb-m">
            <div class="avatar">{ini(p.nombre || '?')}</div>
            <div class="crece">
              <div class="t-fuerte recorta">{p.nombre || 'Sin nombre'}</div>
              <div class="fila gap-s" style="margin-top:3px"><span class="pill {dueno ? 'dueno' : 'empleado'}">{dueno ? 'Dueño' : 'Empleado'}</span><span class="t-mini">{r.num} {plural(r.num, 'pedido')}</span></div>
            </div>
            <div class="monto"><div class="monto-usd">{fmtUSD(r.totalUSD)}</div><div class="monto-bs">{fmtBsTotal(r.totalBs)}</div></div>
          </div>
          <div class="g2 dos" style="margin-bottom:0">
            <Metrica label="Pedidos" valor={r.num} clase="sm" />
            <Metrica label="Ticket prom." valor={fmtUSD(r.ticket)} clase="sm" />
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
