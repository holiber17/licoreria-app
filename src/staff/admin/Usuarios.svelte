<script>
  import { e } from '../../lib/estado.svelte.js';
  import { restGet, restPatch } from '../../lib/api.js';
  import { ini, plural } from '../../lib/catalogo.js';
  import { showToast } from '../../lib/avisos.svelte.js';
  import Vacio from '../../ui/Vacio.svelte';

  let usuarios = $state([]), sucursales = $state([]);
  let elegida = $state({});     // id de usuario pendiente -> sucursal elegida

  async function cargar() {
    const [u, s] = await Promise.all([
      restGet('perfiles?select=*,sucursales(nombre)&order=created_at'),
      restGet('sucursales?select=id,nombre&order=nombre'),
    ]);
    usuarios = u; sucursales = s;
  }
  $effect(() => { cargar(); });

  const pendientes = $derived(usuarios.filter(u => !u.sucursal_id));
  const activos = $derived(usuarios.filter(u => u.sucursal_id));

  async function activar(id) {
    const sucId = elegida[id];
    if (!sucId) { showToast('Selecciona una sucursal', 'danger'); return; }
    await restPatch('perfiles', id, { sucursal_id: sucId, rol: 'empleado' });
    showToast('Usuario activado ✓'); cargar();
  }
  async function cambiarRol(id, rol) { await restPatch('perfiles', id, { rol }); showToast('Rol actualizado ✓'); }
  async function cambiarSucursal(id, sucId) { await restPatch('perfiles', id, { sucursal_id: sucId }); showToast('Sucursal actualizada ✓'); }
</script>

<div id="amt-usuarios">
  <div class="top-bar"><h2>Usuarios</h2></div>
  {#if pendientes.length}
    <div id="pending-banner" class="banner aviso" style="display:flex">
      <i class="ti ti-clock"></i>
      <span id="pending-count">{pendientes.length} {plural(pendientes.length, 'usuario')} {plural(pendientes.length, 'pendiente')} de activación</span>
    </div>
  {/if}
  <div id="usuarios-list">
    {#if !usuarios.length}
      <Vacio icono="ti-users">Sin usuarios registrados.</Vacio>
    {:else}
      {#each [...pendientes.map(u => [u, true]), ...activos.map(u => [u, false])] as [u, pendiente] (u.id)}
        <div class="user-card" class:pending={pendiente}>
          <div class="fila">
            <div class="avatar">{ini(u.nombre || u.id)}</div>
            <div class="crece">
              <div class="t-fuerte recorta">{u.nombre || 'Sin nombre'}</div>
              <div class="t-sub">{#if u.sucursales?.nombre}{u.sucursales.nombre}{:else}<span class="t-aviso">Sin sucursal asignada</span>{/if}</div>
            </div>
            <span class="pill {u.rol || 'empleado'}">{u.rol === 'dueno' ? 'Dueño' : u.rol === 'empleado' ? 'Empleado' : 'Pendiente'}</span>
          </div>
          {#if pendiente}
            <div class="fila gap-s envuelve mt-m">
              <select id="suc-sel-{u.id}" class="campo sm crece" bind:value={elegida[u.id]}>
                <option value="">Seleccionar sucursal...</option>
                {#each sucursales as s (s.id)}<option value={s.id}>{s.nombre}</option>{/each}
              </select>
              <button class="btn sm success" onclick={() => activar(u.id)}><i class="ti ti-check"></i> Activar</button>
            </div>
          {:else}
            <div class="fila gap-s envuelve mt-m">
              <select class="campo sm" style="width:auto" value={u.rol} onchange={ev => cambiarRol(u.id, ev.currentTarget.value)}>
                <option value="dueno">Dueño</option><option value="empleado">Empleado</option>
              </select>
              <select class="campo sm crece" value={u.sucursal_id} onchange={ev => cambiarSucursal(u.id, ev.currentTarget.value)}>
                {#each sucursales as s (s.id)}<option value={s.id}>{s.nombre}</option>{/each}
              </select>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
