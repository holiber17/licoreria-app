<script>
  import { e, esSudo } from '../../lib/estado.svelte.js';
  import { restGet, restPatch } from '../../lib/api.js';
  import { ini, plural } from '../../lib/catalogo.js';
  import { showToast } from '../../lib/avisos.svelte.js';
  import Vacio from '../../ui/Vacio.svelte';
  import { presencia } from '../presencia.svelte.js';

  let usuarios = $state([]), sucursales = $state([]);
  let elegida = $state({});     // id de usuario pendiente -> sucursal elegida

  async function cargar() {
    const [u, s] = await Promise.all([
      restGet('perfiles?select=*,sucursales(nombre)&order=created_at'),
      restGet('sucursales?select=id,nombre,negocios(nombre)&order=nombre'),
    ]);
    usuarios = u; sucursales = s;
  }
  $effect(() => { cargar(); });

  // El sudo ve sucursales de todos los negocios: el nombre del negocio va delante
  const etiquetaSuc = s => (esSudo() && s.negocios?.nombre ? s.negocios.nombre + ' · ' : '') + s.nombre;

  const pendientes = $derived(usuarios.filter(u => !u.sucursal_id));
  const activos = $derived(usuarios.filter(u => u.sucursal_id));
  // Quién tiene la app abierta ahora, y en qué sucursal está trabajando
  const enLinea = id => presencia.enLinea[id];
  const nombreSucursal = id => sucursales.find(s => s.id === id)?.nombre || '';
  // Tú siempre estás: el resumen cuenta a los demás
  const cuantosEnLinea = $derived(usuarios.filter(u => u.id !== e.user?.id && enLinea(u.id)).length);

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
  <p class="en-linea-resumen" id="en-linea-resumen">
    <span class="punto-linea" class:apagado={!cuantosEnLinea}></span>
    {cuantosEnLinea ? `${cuantosEnLinea} ${plural(cuantosEnLinea, 'persona')} más con la app abierta ahora` : 'Nadie más tiene la app abierta ahora'}
  </p>
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
        {@const linea = enLinea(u.id)}
        <div class="user-card" class:pending={pendiente}>
          <div class="fila">
            <div class="avatar con-punto">{ini(u.nombre || u.id)}{#if linea}<span class="punto-linea" title="En línea"></span>{/if}</div>
            <div class="crece">
              <div class="t-fuerte recorta">{u.nombre || 'Sin nombre'}</div>
              <div class="t-sub">{#if u.sucursales?.nombre}{u.sucursales.nombre}{:else}<span class="t-aviso">Sin sucursal asignada</span>{/if}</div>
              {#if linea}<div class="t-en-linea">En línea ahora{nombreSucursal(linea.sucursal_id) ? ' · en ' + nombreSucursal(linea.sucursal_id) : ''}</div>{/if}
            </div>
            <span class="pill {u.rol === 'sudo' ? 'dueno' : u.rol || 'empleado'}">{u.rol === 'sudo' ? 'Sudo' : u.rol === 'dueno' ? 'Dueño' : u.rol === 'empleado' ? 'Empleado' : 'Pendiente'}</span>
          </div>
          {#if pendiente}
            <div class="fila gap-s envuelve mt-m">
              <select id="suc-sel-{u.id}" class="campo sm crece" bind:value={elegida[u.id]}>
                <option value="">Seleccionar sucursal...</option>
                {#each sucursales as s (s.id)}<option value={s.id}>{etiquetaSuc(s)}</option>{/each}
              </select>
              <button class="btn sm success" onclick={() => activar(u.id)}><i class="ti ti-check"></i> Activar</button>
            </div>
          {:else if u.rol !== 'sudo'}
            <div class="fila gap-s envuelve mt-m">
              <select class="campo sm" style="width:auto" value={u.rol} onchange={ev => cambiarRol(u.id, ev.currentTarget.value)}>
                <option value="dueno">Dueño</option><option value="empleado">Empleado</option>
              </select>
              <select class="campo sm crece" value={u.sucursal_id} onchange={ev => cambiarSucursal(u.id, ev.currentTarget.value)}>
                {#each sucursales as s (s.id)}<option value={s.id}>{etiquetaSuc(s)}</option>{/each}
              </select>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
